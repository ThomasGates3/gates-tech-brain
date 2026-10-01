/**
 * Field Console persistence (Neon via Drizzle). Server-only.
 * Unlike the deck's best-effort logs, these calls THROW on DB failure — the
 * send log and suppression list are the safety record, so the console must
 * not pretend they worked.
 */
import { createHash, randomUUID } from "crypto";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { fieldContacts, fieldSendLog, fieldSuppressions } from "@/db/schema";
import { draftHash } from "./workflow";
import type { NotionRow } from "./notion";
import type { DraftSource, FieldContact, Priority, SendLogEntry, Stage, Suppression } from "./types";

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

// ── Send (claim → AgentMail → record) ───────────────────────────────────────

/** Atomically move approved → sending. Returns false if someone else got there first. */
export async function claimForSend(id: string, approvedHash: string): Promise<boolean> {
  const r = await db
    .update(fieldContacts)
    .set({ stage: "sending", lastError: null, updatedAt: new Date().toISOString() })
    .where(and(eq(fieldContacts.id, id), eq(fieldContacts.stage, "approved"), eq(fieldContacts.approvedHash, approvedHash)))
    .returning({ id: fieldContacts.id });
  return r.length === 1;
}

export async function releaseSend(id: string, error: string): Promise<void> {
  await db
    .update(fieldContacts)
    .set({ stage: "approved", lastError: error.slice(0, 500), updatedAt: new Date().toISOString() })
    .where(and(eq(fieldContacts.id, id), eq(fieldContacts.stage, "sending")));
}

export async function recordSend(c: FieldContact, sent: { messageId: string; threadId: string | null; inbox: string; operator: string }): Promise<SendLogEntry> {
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
  };
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

export async function listSuppressions(limit = 200): Promise<Suppression[]> {
  return (await db.select().from(fieldSuppressions).orderBy(desc(fieldSuppressions.at)).limit(limit)) as Suppression[];
}

export async function addSuppression(email: string, reason: Suppression["reason"], by: string): Promise<void> {
  await db
    .insert(fieldSuppressions)
    .values({ email: norm(email), reason, contactId: null, by, at: new Date().toISOString() })
    .onConflictDoUpdate({ target: fieldSuppressions.email, set: { reason, by, at: new Date().toISOString() } });
}
