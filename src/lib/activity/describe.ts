/**
 * Plain-English activity lines for Brain tool calls ("Darrell drafted Email 1 for
 * Gizel Atlanta") instead of tool names and ids. Also cleans up older rows at read time.
 */
import { db } from "@/db";
import { fieldContacts } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { AGENTS } from "@/lib/agents";
import type { ActivityKind, ActivityRow } from "./index";

export const agentLabel = (id?: string) =>
  !id ? "Someone" : id === "thomas" ? "Thomas" : AGENTS.find((a) => a.id === id)?.label ?? id.charAt(0).toUpperCase() + id.slice(1);

type A = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const n = (a: A) => (a.email_n && a.email_n !== 1 ? `Email ${a.email_n}` : "Email 1");
const how = (g: unknown) => (g === "template" ? " from the template" : g === "opus" ? " with Claude Opus" : g === "sonnet" ? " with Claude" : "");

/** Sentence + optional detail + kind for a successful tool call. */
export function describeCall(name: string, a: A, result: unknown, agent: string, business: string): { target: string; because?: string; kind?: ActivityKind } {
  const who = agentLabel(agent);
  const r = (result ?? {}) as A;
  const B = business || "a lead";
  switch (name) {
    case "brain_set_draft":
      return { target: a.generate ? `${who} drafted ${n(a)} for ${B}${how(a.generate)}` : `${who} rewrote ${n(a)} for ${B}` };
    case "brain_import_draft":
      return { target: `${who} added ${n(a)} copy for ${B}` };
    case "brain_set_nick_status":
      return { target: `Nick marked ${B} ${str(a.verdict)}${a.email_n && a.email_n !== 1 ? ` (${n(a)})` : ""}`, because: str(a.note) || undefined };
    case "brain_batch_nick": {
      const items = (a.items as A[]) ?? [];
      const tally = ["PASS", "REVISE", "KILL"].map((v) => [v, items.filter((i) => i.verdict === v).length] as const).filter(([, k]) => k).map(([v, k]) => `${k} ${v}`).join(", ");
      return { target: `Nick reviewed ${items.length} draft${items.length === 1 ? "" : "s"}`, because: [tally, r.failed ? `${r.failed} failed` : ""].filter(Boolean).join(" · ") };
    }
    case "brain_batch_set_draft": {
      const items = (a.items as A[]) ?? [];
      return { target: `${who} drafted ${r.succeeded ?? items.length} email${items.length === 1 ? "" : "s"}`, because: r.failed ? `${r.failed} failed` : undefined };
    }
    case "brain_approve":
      return { target: `${who} approved ${n(a)} for ${B}`, because: "approved, not sent" };
    case "brain_approve_send":
      return { target: `${n(a)} sent to ${B}`, kind: "sent" };
    case "brain_hold":
      return { target: a.hold ? `${B} put on hold` : `${B} released from hold` };
    case "brain_upsert_contact":
      return { target: r.created ? `${who} added ${B}` : `${who} updated ${B}`, because: [str(r.lane), str(r.priority)].filter(Boolean).join(" · ") || undefined };
    case "brain_merge_contacts":
      return { target: `${who} merged a duplicate into ${B}` };
    case "brain_suppress":
      return { target: `${str(a.email)} won't be emailed again`, because: str(a.reason).replace("_", " ") };
    case "brain_report_activity":
      return { target: `${who}: ${str(a.action)}`, because: str(a.detail).slice(0, 240) || undefined };
    case "brain_chat":
      return { target: `${who} asked Claude`, because: str(a.prompt).replace(/\s+/g, " ").slice(0, 90) || undefined };
    case "brain_run_automation":
      return { target: `${who} ran ${str((r as A).name) || str(a.name)}${a.dry_run === false ? "" : " (dry run)"}`, kind: "generated" };
    case "brain_field_queue": {
      const loaded = r.loaded as A | null;
      return loaded ? { target: `${who} loaded the Notion pack`, because: `${loaded.added} new, ${loaded.updated} updated`, kind: "updated" } : { target: `${who} looked at the queue` };
    }
    case "brain_nick_queue":
      return a.submit ? { target: `${who} sent ${r.submitted} draft${r.submitted === 1 ? "" : "s"} to Nick`, kind: "updated" } : { target: `${who} pulled Nick's pack (${r.count})` };
    case "brain_set_gate":
      return a.domain_warmed === undefined && a.daily_cap === undefined
        ? { target: `${who} checked the send gates` }
        : { target: `${who} changed the send gates`, because: [a.domain_warmed !== undefined && `warm-up ${a.domain_warmed ? "confirmed" : "off"}`, a.daily_cap !== undefined && `daily cap ${a.daily_cap}`].filter(Boolean).join(" · "), kind: "updated" };
    case "brain_inbound":
      return { target: `${who} checked replies`, because: `${r.unanswered ?? 0} unanswered${r.suppressed ? ` · ${r.suppressed} opted out` : ""}`, kind: a.confirm_suppress ? "updated" : undefined };
    case "brain_today": return { target: `${who} checked today's status` };
    case "brain_get_draft": return { target: `${who} opened ${B}'s ${n(a)}` };
    case "brain_get_brief": return { target: `${who} read the outreach brief` };
    case "brain_next_due": return { target: `${who} checked follow-ups due` };
    default: return { target: `${who} used ${name.replace(/^brain_/, "").replace(/_/g, " ")}` };
  }
}

export function describeFailure(title: string, business: string, error: string): { target: string; because: string } {
  return { target: `${title}${business ? ` for ${business}` : ""} didn't go through`, because: error.replace(/\s+/g, " ").slice(0, 200) };
}

// ── Read-time cleanup for older rows ─────────────────────────────────────────
const ID = /\b(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|(?:ashley|prospectacle|notion|manual|csv)_[0-9a-f]{16})\b/g;
const OLD_TITLES: [RegExp, string][] = [
  [/^Batch: Nick verdicts: (\d+) items$/, "Nick reviewed $1 drafts"],
  [/^Batch: write drafts: (\d+) items$/, "Drafts written for $1 leads"],
  [/^Report what you did: /, ""],
  [/^Ask Claude$/, "Asked Claude"],
  [/^Run an automation: (.+)$/, "Ran $1"],
  [/^Nick's pack$/, "Pulled Nick's pack"],
  [/^Field queue$/, "Looked at the queue"],
  [/^Recent activity$/, "Checked activity"],
  [/^Agent roster$/, "Checked the roster"],
  [/^Outreach brief$/, "Read the outreach brief"],
  [/^Hold \/ release failed$/, "Hold or release didn't go through"],
  [/^(.+) failed$/, "$1 didn't go through"],
  [/^Write email draft: /, "Email draft written for "],
  [/^Get Email 1 draft: /, "Opened the draft for "],
  [/^Nick verdict: /, "Nick verdict for "],
  [/^Hold \/ release: /, "Hold or release for "],
  [/^Upsert a contact: /, "Lead added or updated: "],
  [/^Approve \(no send\): /, "Approved (not sent): "],
  [/^Today's Field status$/, "Checked today's status"],
];

export async function humanizeRows(rows: ActivityRow[]): Promise<(ActivityRow & { lookup: boolean })[]> {
  const ids = [...new Set(rows.flatMap((r) => r.target.match(ID) ?? []))];
  const names = new Map(ids.length ? (await db.select({ id: fieldContacts.id, name: fieldContacts.name }).from(fieldContacts).where(inArray(fieldContacts.id, ids))).map((x) => [x.id, x.name]) : []);
  return rows.map((r) => {
    let target = r.target;
    for (const [re, rep] of OLD_TITLES) target = target.replace(re, rep);
    target = target.replace(ID, (id) => names.get(id) ?? "a lead (since merged)").replace(/ · \d+ items$/, "");
    target = target.replace(/^Nick verdict for (.+?) · (PASS|REVISE|KILL)$/, "Nick marked $1 $2");
    if (!target) target = "Update";
    const because = r.because?.replace(/^(MCP|REST) brain_\w+:?\s*(· )?/, "").replace(/\s*·?\s*(MCP|REST) brain_\w+/g, "").trim() || undefined;
    return { ...r, target, because, lookup: r.kind === "queried" };
  });
}
