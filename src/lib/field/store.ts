/**
 * Field Console persistence (Neon via Drizzle). Server-only.
 * Unlike the deck's best-effort logs, these calls THROW on DB failure — the
 * send log and suppression list are the safety record, so the console must
 * not pretend they worked.
 */
import { createHash, randomUUID } from "crypto";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { fieldContacts, fieldSendLog, fieldSteps, fieldSuppressions } from "@/db/schema";
import { draftHash } from "./workflow";
import type { NotionRow } from "./notion";
import type { ContactSource, DraftSource, EmailN, FieldContact, Lane, Priority, SendLogEntry, Stage, Suppression } from "./types";

type Row = typeof fieldContacts.$inferSelect;

const toContact = (r: Row): FieldContact => r as unknown as FieldContact;
const norm = (email: string) => email.trim().toLowerCase();

/** Body text the Notion DB uses as a "not drafted yet" placeholder. */
const PLACEHOLDER = /^(claude\s+)?tbd\.?$/i;

export async function listQueue(date: string): Promise<(FieldContact & { suppressed: boolean })[]> {
  const rows = await db.select().from(fieldContacts).where(eq(fieldContacts.packDate, date));
  const emails = [...new Set(rows.map((r) => norm(r.email)).filter(Boolean))];
  const sup = emails.length
    ? new Set((await db.select({ email: fieldSuppressions.email }).from(fieldSuppressions).where(inArray(fieldSuppressions.email, emails))).map((s) => s.email))
    : new Set<string>();
  const order: Record<string, number> = { High: 0, Med: 1, Soft: 2 };
  return rows
    .map((r) => ({ ...toContact(r), suppressed: sup.has(norm(r.email)) }))
    .sort((a, b) => order[a.priority] - order[b.priority] || a.name.localeCompare(b.name));
}

export async function getContact(id: string): Promise<FieldContact | null> {
  const [r] = await db.select().from(fieldContacts).where(eq(fieldContacts.id, id)).limit(1);
  return r ? toContact(r) : null;
}

export async function patchContact(id: string, patch: Partial<FieldContact>): Promise<FieldContact> {
  const [r] = await db
    .update(fieldContacts)
    .set({ ...(patch as Partial<Row>), updatedAt: new Date().toISOString() })
    .where(eq(fieldContacts.id, id))
    .returning();
  if (!r) throw new Error("Contact not found.");
  return toContact(r);
}

export async function isSuppressed(email: string): Promise<boolean> {
  const [r] = await db.select({ email: fieldSuppressions.email }).from(fieldSuppressions).where(eq(fieldSuppressions.email, norm(email))).limit(1);
  return Boolean(r);
}

// ── Import (Notion pack or CSV) ─────────────────────────────────────────────

type SourceRow = Omit<NotionRow, "pageId"> & { pageId?: string };

function initialStage(row: SourceRow, priority: Priority, hasDraft: boolean): Stage {
  if (row.status === "Sent") return "sent";
  if (row.status === "Kill") return "kill";
  if (row.status === "Hold" || priority === "Soft") return "hold";
  return hasDraft ? "drafted" : "new";
}

export interface ImportSummary {
  added: number;
  updated: number;
  skipped: number;
}

export async function importRows(rows: SourceRow[], source: "notion" | "csv", fallbackDate: string): Promise<ImportSummary> {
  const summary: ImportSummary = { added: 0, updated: 0, skipped: 0 };
  const now = new Date().toISOString();
  const keyed = rows.flatMap((row) => {
    if (!row.name) {
      summary.skipped++;
      return [];
    }
    const id = source === "notion" && row.pageId ? row.pageId : `csv_${createHash("sha1").update(`${norm(row.email)}|${row.name.toLowerCase()}`).digest("hex").slice(0, 16)}`;
    return [{ id, row }];
  });
  if (!keyed.length) return summary;

  const existing = new Map(
    (await db.select().from(fieldContacts).where(inArray(fieldContacts.id, keyed.map((k) => k.id)))).map((r) => [r.id, toContact(r)])
  );

  // Sent outside the console → suppress the address so no other row can email it again.
  const sentElsewhere = keyed.filter(({ row }) => row.status === "Sent" && row.email);
  if (sentElsewhere.length) {
    await db
      .insert(fieldSuppressions)
      .values(sentElsewhere.map(({ id, row }) => ({ email: norm(row.email), reason: "sent_email1", contactId: id, by: source, at: now })))
      .onConflictDoNothing();
  }

  for (const { id, row } of keyed) {
    // Anything not explicitly High/Med is treated as Soft → Hold-only.
    const priority: Priority = row.priority === "High" || row.priority === "Med" ? row.priority : "Soft";
    const prev = existing.get(id);

    // Same person already added by Ashley/Prospectacle/manual and not yet sent → attach, don't duplicate.
    const twin = !prev && source === "notion" && row.email ? await unsentByEmail(row.email) : null;
    if (twin) {
      const hasDraft = Boolean(row.subject && row.body && !PLACEHOLDER.test(row.body));
      const tier = twin.priority; // existing lead keeps its tier; a differing Notion tier is noted, never applied silently
      const patch: Partial<FieldContact> = {
        notionPageId: row.pageId ?? null,
        priority: tier,
        packDate: row.date || fallbackDate,
        ...(!twin.gap && row.gap && { gap: row.gap }),
        ...(!twin.city && row.city && { city: row.city }),
        ...(priority !== twin.priority && { notes: [twin.notes, `Notion tier ${priority}; kept ${tier}.`].filter(Boolean).join(" ") }),
      };
      if (hasDraft && !twin.draftHash && twin.stage === "new") Object.assign(patch, { subject: row.subject, body: row.body, draftSource: "notion", draftHash: draftHash(row.subject.trim(), row.body.trim()), stage: "drafted" });
      if (tier === "Soft" && ["new", "drafted", "nick", "approved"].includes(twin.stage)) Object.assign(patch, { stage: "hold", approvedHash: null, approvedAt: null, approvedBy: null });
      await patchContact(twin.id, patch);
      summary.updated++;
      continue;
    }

    if (!prev) {
      const hasDraft = Boolean(row.subject && row.body && !PLACEHOLDER.test(row.body));
      await db.insert(fieldContacts).values({
        id,
        source,
        notionPageId: source === "notion" ? (row.pageId ?? null) : null,
        name: row.name,
        email: row.email,
        city: row.city,
        batch: row.batch,
        gap: row.gap,
        priority,
        packDate: row.date || fallbackDate,
        stage: initialStage(row, priority, hasDraft),
        subject: hasDraft ? row.subject : "",
        body: hasDraft ? row.body : "",
        draftSource: hasDraft ? (source as DraftSource) : null,
        draftHash: hasDraft ? draftHash(row.subject.trim(), row.body.trim()) : null,
        updatedAt: now,
      });
      summary.added++;
      continue;
    }

    // Refresh source facts; never clobber console workflow state on a re-load.
    const patch: Partial<FieldContact> = { name: row.name, email: row.email, city: row.city, batch: row.batch, gap: row.gap, priority };
    const open = prev.stage === "new" || prev.stage === "drafted" || prev.stage === "nick" || prev.stage === "approved";
    if (open) {
      if (row.status === "Sent") patch.stage = "sent"; // sent outside the console — never send twice
      else if (row.status === "Kill") patch.stage = "kill";
      else if (row.status === "Hold" || priority === "Soft") patch.stage = "hold";
      if (norm(prev.email) !== norm(row.email) && (prev.stage === "nick" || prev.stage === "approved")) {
        // Recipient changed under an audit/approval — both must be redone.
        Object.assign(patch, { stage: patch.stage ?? "drafted", nickVerdict: null, nickHash: null, approvedHash: null, approvedAt: null, approvedBy: null });
      }
      if (patch.stage === "hold" || patch.stage === "kill") Object.assign(patch, { approvedHash: null, approvedAt: null, approvedBy: null });
    }
    await patchContact(id, patch);
    summary.updated++;
  }
  return summary;
}

// ── Sequence steps (Email 2–4) ──────────────────────────────────────────────

type StepRow = typeof fieldSteps.$inferSelect;
export type StepFields = Pick<FieldContact, "stage" | "subject" | "body" | "draftSource" | "draftHash" | "nickVerdict" | "nickNote" | "nickHash" | "nickAt" | "nickBy" | "approvedHash" | "approvedAt" | "approvedBy" | "sentAt" | "lastError"> & { messageId: string | null };
const STEP_KEYS = ["stage", "subject", "body", "draftSource", "draftHash", "nickVerdict", "nickNote", "nickHash", "nickAt", "nickBy", "approvedHash", "approvedAt", "approvedBy", "sentAt", "lastError", "messageId"] as const;
const emptyStep = (): StepFields => ({ stage: "new", subject: "", body: "", draftSource: null, draftHash: null, nickVerdict: null, nickNote: null, nickHash: null, nickAt: null, nickBy: null, approvedHash: null, approvedAt: null, approvedBy: null, sentAt: null, lastError: null, messageId: null });
const stepId = (contactId: string, n: number) => `${contactId}:${n}`;

export async function getStep(contactId: string, n: EmailN): Promise<StepFields> {
  const [r] = await db.select().from(fieldSteps).where(eq(fieldSteps.id, stepId(contactId, n))).limit(1);
  return r ? (r as unknown as StepFields) : emptyStep();
}

export async function listSteps(contactIds: string[]): Promise<StepRow[]> {
  return contactIds.length ? db.select().from(fieldSteps).where(inArray(fieldSteps.contactId, contactIds)) : [];
}

export async function patchStep(contactId: string, n: EmailN, patch: Partial<StepFields>): Promise<StepFields> {
  const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => (STEP_KEYS as readonly string[]).includes(k)));
  const now = new Date().toISOString();
  const [r] = await db
    .insert(fieldSteps)
    .values({ id: stepId(contactId, n), contactId, n, ...emptyStep(), ...clean, updatedAt: now } as typeof fieldSteps.$inferInsert)
    .onConflictDoUpdate({ target: fieldSteps.id, set: { ...clean, updatedAt: now } })
    .returning();
  return r as unknown as StepFields;
}

// ── Upsert one contact (Ashley / Prospectacle / manual) ─────────────────────

export interface UpsertInput {
  contactId?: string;
  business: string;
  contactName?: string;
  email: string;
  tier: Priority;
  lane: Lane;
  siteUrl?: string;
  notes?: string;
  gap?: string;
  city?: string;
  source: ContactSource;
  date: string;
}

/** Upsert by contact_id, else by email. Never resets workflow state; an unsent contact moves onto `date`'s queue. */
export async function upsertContact(u: UpsertInput): Promise<{ contact: FieldContact; created: boolean }> {
  const now = new Date().toISOString();
  const email = norm(u.email);
  const [prev] = u.contactId
    ? await db.select().from(fieldContacts).where(eq(fieldContacts.id, u.contactId)).limit(1)
    : await db.select().from(fieldContacts).where(sql`lower(${fieldContacts.email}) = ${email}`).orderBy(desc(fieldContacts.updatedAt)).limit(1);
  const facts = {
    name: u.business,
    email,
    priority: u.tier,
    lane: u.lane,
    ...(u.contactName !== undefined && { contactName: u.contactName }),
    ...(u.siteUrl !== undefined && { siteUrl: u.siteUrl }),
    ...(u.notes !== undefined && { notes: u.notes }),
    ...(u.gap !== undefined && { gap: u.gap }),
    ...(u.city !== undefined && { city: u.city }),
  };
  if (prev) {
    const c = toContact(prev);
    const unsent = c.stage !== "sent" && c.stage !== "sending";
    const patch: Partial<FieldContact> = { ...facts, ...(unsent && { packDate: u.date }) };
    if (u.tier === "Soft" && (c.stage === "new" || c.stage === "drafted" || c.stage === "nick" || c.stage === "approved")) Object.assign(patch, { stage: "hold", approvedHash: null, approvedAt: null, approvedBy: null });
    if (norm(c.email) !== email && (c.stage === "nick" || c.stage === "approved")) Object.assign(patch, { stage: "drafted", nickVerdict: null, nickHash: null, approvedHash: null, approvedAt: null, approvedBy: null });
    return { contact: await patchContact(c.id, patch), created: false };
  }
  const id = u.contactId ?? `${u.source}_${createHash("sha1").update(`${email}|${u.business.toLowerCase()}`).digest("hex").slice(0, 16)}`;
  const [r] = await db
    .insert(fieldContacts)
    .values({ id, source: u.source, notionPageId: null, city: u.city ?? "", batch: `${u.date} ${u.lane}`, gap: u.gap ?? "", packDate: u.date, stage: u.tier === "Soft" ? "hold" : "new", updatedAt: now, ...facts })
    .returning();
  return { contact: toContact(r), created: true };
}

/** Follow-up steps (Email 2–4) approved and not yet sent. */
export async function approvedStepsCount(): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(fieldSteps).where(eq(fieldSteps.stage, "approved"));
  return r?.n ?? 0;
}

export async function markReplied(contactId: string, at: string): Promise<void> {
  await db.update(fieldContacts).set({ repliedAt: at }).where(and(eq(fieldContacts.id, contactId), sql`${fieldContacts.repliedAt} is null`));
}

export async function contactsByEmail(emails: string[]): Promise<FieldContact[]> {
  const list = [...new Set(emails.map(norm))].filter(Boolean);
  return list.length ? (await db.select().from(fieldContacts).where(inArray(sql`lower(${fieldContacts.email})`, list))).map(toContact) : [];
}

/** Contacts whose Email 1 went out (sequence candidates). */
export async function sequenceContacts(): Promise<FieldContact[]> {
  return (await db.select().from(fieldContacts).where(eq(fieldContacts.stage, "sent"))).map(toContact);
}

/** A suppression that blocks this contact. A contact's own "sent_email1" entry doesn't block its follow-ups. */
export async function blockingSuppression(email: string, contactId: string): Promise<Suppression | null> {
  const [r] = await db.select().from(fieldSuppressions).where(eq(fieldSuppressions.email, norm(email))).limit(1);
  if (!r) return null;
  if (r.reason === "sent_email1" && r.contactId === contactId) return null;
  return r as Suppression;
}

/** Last AgentMail message we sent this contact (follow-ups reply into its thread). */
export async function lastSent(contactId: string): Promise<SendLogEntry | null> {
  const [r] = await db.select().from(fieldSendLog).where(eq(fieldSendLog.contactId, contactId)).orderBy(desc(fieldSendLog.sentAt)).limit(1);
  return (r as SendLogEntry) ?? null;
}

/** An unsent, non-Notion contact with this email (attach target for Notion loads). */
async function unsentByEmail(email: string): Promise<FieldContact | null> {
  const rows = await db.select().from(fieldContacts).where(sql`lower(${fieldContacts.email}) = ${norm(email)} and ${fieldContacts.notionPageId} is null and ${fieldContacts.stage} not in ('sent','sending')`).orderBy(desc(fieldContacts.updatedAt)).limit(1);
  return rows[0] ? toContact(rows[0]) : null;
}

/** Fold `dropId` into `keepId`: fill keep's gaps from drop, then delete drop. Both must be unsent. */
export async function mergeContacts(keepId: string, dropId: string): Promise<FieldContact> {
  if (keepId === dropId) throw new Error("keep_id and drop_id are the same contact.");
  const [keep, drop] = await Promise.all([getContact(keepId), getContact(dropId)]);
  if (!keep || !drop) throw new Error("Contact not found.");
  if (["sent", "sending"].includes(drop.stage) || ["sent", "sending"].includes(keep.stage)) throw new Error("Can't merge a contact that was already sent.");
  if ((await listSteps([dropId])).length) throw new Error("drop_id has sequence steps; merge refused.");
  const tier = keep.priority; // the primary decides; Soft never pulls a High/Med lead onto Hold
  const patch: Partial<FieldContact> = {
    priority: tier,
    contactName: keep.contactName ?? drop.contactName,
    siteUrl: keep.siteUrl ?? drop.siteUrl,
    notes: [keep.notes, drop.notes, drop.priority !== keep.priority ? `Merged a ${drop.priority} copy from ${drop.source}; kept ${tier}.` : null].filter(Boolean).join(" ") || null,
    gap: keep.gap || drop.gap,
    city: keep.city || drop.city,
    notionPageId: keep.notionPageId ?? drop.notionPageId,
  };
  if (!keep.draftHash && drop.draftHash) Object.assign(patch, { subject: drop.subject, body: drop.body, draftSource: drop.draftSource, draftHash: drop.draftHash, stage: keep.stage === "new" ? "drafted" : keep.stage, nickVerdict: null, nickHash: null });
  if (tier === "Soft" && ["new", "drafted", "nick", "approved"].includes(patch.stage ?? keep.stage)) Object.assign(patch, { stage: "hold", approvedHash: null, approvedAt: null, approvedBy: null });
  const merged = await patchContact(keepId, patch);
  await db.delete(fieldContacts).where(eq(fieldContacts.id, dropId));
  return merged;
}

// ── Send (claim → AgentMail → record) ───────────────────────────────────────

/** Atomically move approved → sending. Returns false if someone else got there first. */
export async function claimForSend(id: string, approvedHash: string, n: EmailN = 1): Promise<boolean> {
  if (n > 1) {
    const r = await db
      .update(fieldSteps)
      .set({ stage: "sending", lastError: null, updatedAt: new Date().toISOString() })
      .where(and(eq(fieldSteps.id, stepId(id, n)), eq(fieldSteps.stage, "approved"), eq(fieldSteps.approvedHash, approvedHash)))
      .returning({ id: fieldSteps.id });
    return r.length === 1;
  }
  const r = await db
    .update(fieldContacts)
    .set({ stage: "sending", lastError: null, updatedAt: new Date().toISOString() })
    .where(and(eq(fieldContacts.id, id), eq(fieldContacts.stage, "approved"), eq(fieldContacts.approvedHash, approvedHash)))
    .returning({ id: fieldContacts.id });
  return r.length === 1;
}

export async function releaseSend(id: string, error: string, n: EmailN = 1): Promise<void> {
  if (n > 1) {
    await db
      .update(fieldSteps)
      .set({ stage: "approved", lastError: error.slice(0, 500), updatedAt: new Date().toISOString() })
      .where(and(eq(fieldSteps.id, stepId(id, n)), eq(fieldSteps.stage, "sending")));
    return;
  }
  await db
    .update(fieldContacts)
    .set({ stage: "approved", lastError: error.slice(0, 500), updatedAt: new Date().toISOString() })
    .where(and(eq(fieldContacts.id, id), eq(fieldContacts.stage, "sending")));
}

export async function recordSend(c: FieldContact, sent: { messageId: string; threadId: string | null; inbox: string; operator: string }, n: EmailN = 1): Promise<SendLogEntry> {
  const at = new Date().toISOString();
  const entry: SendLogEntry = {
    id: `fsl_${randomUUID()}`,
    contactId: c.id,
    contactName: c.name,
    recipient: c.email,
    subject: c.subject,
    agentmailMessageId: sent.messageId,
    agentmailThreadId: sent.threadId,
    inbox: sent.inbox,
    operator: sent.operator,
    suppressed: true,
    sentAt: at,
    emailN: n,
  };
  if (n > 1) {
    await db.batch([
      db.update(fieldSteps).set({ stage: "sent", sentAt: at, messageId: sent.messageId, lastError: null, updatedAt: at }).where(eq(fieldSteps.id, stepId(c.id, n))),
      db.insert(fieldSendLog).values(entry),
    ]);
    return entry;
  }
  await db.batch([
    db.update(fieldContacts).set({ stage: "sent", sentAt: at, lastError: null, updatedAt: at }).where(eq(fieldContacts.id, c.id)),
    db.insert(fieldSendLog).values(entry),
    db
      .insert(fieldSuppressions)
      .values({ email: norm(c.email), reason: "sent_email1", contactId: c.id, by: sent.operator, at })
      .onConflictDoNothing(),
  ]);
  return entry;
}

export async function sentSince(iso: string): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(fieldSendLog).where(gte(fieldSendLog.sentAt, iso));
  return r?.n ?? 0;
}

// ── Log + suppression list ──────────────────────────────────────────────────

export async function listLog(limit = 100): Promise<SendLogEntry[]> {
  return (await db.select().from(fieldSendLog).orderBy(desc(fieldSendLog.sentAt)).limit(limit)) as SendLogEntry[];
}

export async function listSuppressions(limit = 200, search?: string): Promise<Suppression[]> {
  const q = db.select().from(fieldSuppressions);
  const rows = search ? q.where(sql`${fieldSuppressions.email} ilike ${`%${search.trim().toLowerCase()}%`}`) : q;
  return (await rows.orderBy(desc(fieldSuppressions.at)).limit(limit)) as Suppression[];
}

export async function addSuppression(email: string, reason: Suppression["reason"], by: string): Promise<void> {
  await db
    .insert(fieldSuppressions)
    .values({ email: norm(email), reason, contactId: null, by, at: new Date().toISOString() })
    .onConflictDoUpdate({ target: fieldSuppressions.email, set: { reason, by, at: new Date().toISOString() } });
}
