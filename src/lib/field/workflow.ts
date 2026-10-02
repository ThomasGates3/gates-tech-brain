/**
 * Field Console workflow — pure state machine for one contact.
 *
 *   new → drafted → nick (PASS) → approved → sending → sent
 *                 ↘ REVISE → drafted      ↘ KILL → kill
 *   any open stage ⇄ hold   ·   Soft priority is Hold-only, never sendable
 *
 * Every gate the PRD names is enforced here, server-side, so the UI can't route
 * around it: Approve needs Nick PASS on the exact current draft; Send needs
 * a greenlighter (Thomas, or Ace once FIELD_ACE_CAN_SEND=true) + an approval of
 * the exact current draft; copy passes the outreach-brief lint.
 */
import { createHash } from "crypto";
import { lintCopy, type LintIssue } from "./lint";
import type { DraftSource, FieldContact, NickVerdict, Operator, Stage } from "./types";

export type Action =
  | { type: "save_draft"; subject: string; body: string; source: DraftSource }
  | { type: "submit_nick" }
  | { type: "nick_verdict"; verdict: NickVerdict; note: string }
  | { type: "approve" }
  | { type: "hold" }
  | { type: "release" };

export interface Ctx {
  operator: Operator | null;
  suppressed: boolean;
  now: string;
  aceCanSend?: boolean;
  /** Lane rules (website Email 1: three fixes, no links) computed by the caller. */
  extraLint?: LintIssue[];
}

/** Who may Approve + Send: Thomas always, Ace only when FIELD_ACE_CAN_SEND=true. */
export const canGreenlight = (operator: Operator | null, aceCanSend = false) => operator === "thomas" || (operator === "ace" && aceCanSend);
const GREENLIGHT_ONLY = "Thomas-only (Ace too once FIELD_ACE_CAN_SEND=true).";

export type Result =
  | { ok: true; patch: Partial<FieldContact> }
  | { ok: false; status: number; error: string };

const OPEN: Stage[] = ["new", "drafted", "nick", "approved"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function draftHash(subject: string, body: string): string {
  return createHash("sha256").update(`${subject}\n\u0000\n${body}`).digest("hex").slice(0, 32);
}

const fail = (status: number, error: string): Result => ({ ok: false, status, error });

function lintError(c: Pick<FieldContact, "subject" | "body">, extra: LintIssue[] = []): string | null {
  const issues = [...lintCopy(c.subject, c.body), ...extra];
  return issues.length ? `Copy lint failed: ${issues.map((i) => `"${i.match}" (${i.rule})`).join(", ")}. Rewrite per the outreach brief.` : null;
}

/** Shared gate for Approve and Send: is this contact a legal Email 1 target? */
function targetError(c: FieldContact, ctx: Ctx): string | null {
  if (c.priority === "Soft") return "Soft contacts are Hold-only.";
  if (ctx.suppressed) return `${c.email} is on the suppression list.`;
  if (!EMAIL.test(c.email)) return "Recipient email is missing or invalid.";
  if (!c.subject.trim() || !c.body.trim()) return "Draft subject and body are required.";
  return lintError(c, ctx.extraLint);
}

export function apply(c: FieldContact, action: Action, ctx: Ctx): Result {
  if (c.stage === "sending") return fail(409, "A send is in flight for this contact.");
  if (c.stage === "sent") return fail(409, "Already sent. Email 1 goes out once per contact.");
  if (c.stage === "kill") return fail(409, "Contact was killed.");

  switch (action.type) {
    case "save_draft": {
      if (!OPEN.includes(c.stage)) return fail(409, `Can't edit a draft while ${c.stage}.`);
      if (c.priority === "Soft") return fail(409, "Soft contacts are Hold-only.");
      const subject = action.subject.trim();
      const body = action.body.trim();
      if (!subject || !body) return fail(400, "Subject and body are required.");
      const hash = draftHash(subject, body);
      if (hash === c.draftHash) return { ok: true, patch: {} };
      // Any edit invalidates a prior PASS and approval — Nick must re-audit.
      return {
        ok: true,
        patch: {
          subject,
          body,
          draftSource: action.source,
          draftHash: hash,
          stage: "drafted",
          nickVerdict: c.nickVerdict === "REVISE" ? "REVISE" : null,
          nickHash: null,
          approvedHash: null,
          approvedAt: null,
          approvedBy: null,
          lastError: null,
        },
      };
    }

    case "submit_nick": {
      if (c.stage !== "drafted") return fail(409, "Only a saved draft can go to Nick.");
      const lint = lintError(c, ctx.extraLint);
      if (lint) return fail(422, lint);
      return { ok: true, patch: { stage: "nick", nickVerdict: null, nickHash: null } };
    }

    case "nick_verdict": {
      if (c.stage !== "drafted" && c.stage !== "nick") return fail(409, "Nick audits a saved draft (Drafted or Nick stage).");
      if (!c.draftHash) return fail(409, "No draft to audit.");
      const base = { nickVerdict: action.verdict, nickNote: action.note.trim() || null, nickAt: ctx.now, nickBy: ctx.operator ?? "unknown" };
      if (action.verdict === "PASS") {
        const lint = lintError(c, ctx.extraLint);
        if (lint) return fail(422, `Can't PASS: ${lint}`);
        return { ok: true, patch: { ...base, stage: "nick", nickHash: c.draftHash } };
      }
      if (action.verdict === "REVISE") return { ok: true, patch: { ...base, stage: "drafted", nickHash: null } };
      return { ok: true, patch: { ...base, stage: "kill", nickHash: null, approvedHash: null } };
    }

    case "approve": {
      if (!canGreenlight(ctx.operator, ctx.aceCanSend)) return fail(403, `Approve is ${GREENLIGHT_ONLY}`);
      if (c.stage !== "nick" || c.nickVerdict !== "PASS") return fail(409, "Approve requires Nick PASS.");
      if (!c.draftHash || c.nickHash !== c.draftHash) return fail(409, "Draft changed after Nick PASS — needs a fresh audit.");
      const err = targetError(c, ctx);
      if (err) return fail(422, err);
      return { ok: true, patch: { stage: "approved", approvedHash: c.draftHash, approvedAt: ctx.now, approvedBy: ctx.operator } };
    }

    case "hold": {
      if (!OPEN.includes(c.stage)) return fail(409, `Can't hold while ${c.stage}.`);
      return { ok: true, patch: { stage: "hold", approvedHash: null, approvedAt: null, approvedBy: null } };
    }

    case "release": {
      if (c.stage !== "hold") return fail(409, "Contact isn't on hold.");
      if (c.priority === "Soft") return fail(409, "Soft contacts are Hold-only.");
      return { ok: true, patch: { stage: c.draftHash ? "drafted" : "new", nickVerdict: null, nickHash: null } };
    }
  }
}

/** Final pre-flight before handing the email to AgentMail. */
export function sendError(c: FieldContact, ctx: Ctx): { status: number; error: string } | null {
  if (!canGreenlight(ctx.operator, ctx.aceCanSend)) return { status: 403, error: `Send is ${GREENLIGHT_ONLY}` };
  if (c.stage === "sent" || c.stage === "sending") return { status: 409, error: "Already sent (or in flight). Email 1 goes out once per contact." };
  if (c.stage !== "approved") return { status: 409, error: "Send requires Approve first." };
  if (!c.draftHash || c.approvedHash !== c.draftHash) return { status: 409, error: "Draft changed after approval — re-audit and re-approve." };
  const err = targetError(c, ctx);
  return err ? { status: 422, error: err } : null;
}
