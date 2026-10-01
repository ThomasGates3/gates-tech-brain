/**
 * Field Console — gate + playbook tests. Run: npm test
 * Covers the PRD's acceptance gates that live in pure logic.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { lintPrices } from "./lint";
import { templateDraft, shortCity, shortName, composeOutgoing, canSpamFooter } from "./playbook";
import { apply, draftHash, sendError, type Ctx } from "./workflow";
import { csvToRows } from "./csv";
import type { FieldContact } from "./types";

const signer = { name: "Thomas", company: "Gates Technologies" };
const now = "2026-10-01T13:00:00.000Z";
const thomas: Ctx = { operator: "thomas", suppressed: false, now };
const ace: Ctx = { operator: "ace", suppressed: false, now };

function contact(over: Partial<FieldContact> = {}): FieldContact {
  return {
    id: "c1", source: "notion", notionPageId: "p1", name: "Cosmo Med Spa & Salon", email: "hi@cosmo.example",
    city: "Alpharetta", batch: "2026-09-24 ATL med spa", gap: "Published hours are Tuesday-Saturday 9-5 with Sunday and Monday closed",
    priority: "High", packDate: "2026-10-01", stage: "new", subject: "", body: "", draftSource: null, draftHash: null,
    nickVerdict: null, nickNote: null, nickHash: null, nickAt: null, nickBy: null, approvedHash: null, approvedAt: null,
    approvedBy: null, sentAt: null, lastError: null, updatedAt: now, ...over,
  };
}

/** Walk a contact through the workflow, asserting each step succeeds. */
function step(c: FieldContact, action: Parameters<typeof apply>[1], ctx: Ctx = ace): FieldContact {
  const r = apply(c, action, ctx);
  assert.ok(r.ok, r.ok ? "" : `${action.type} failed: ${r.error}`);
  return { ...c, ...r.patch };
}

function drafted(over: Partial<FieldContact> = {}) {
  const d = templateDraft(contact(over), signer);
  return step(contact(over), { type: "save_draft", ...d, source: "template" });
}

// ── Playbook ────────────────────────────────────────────────────────────────

test("template matches the Field playbook shape and has no prices", () => {
  const d = templateDraft(contact(), signer);
  assert.equal(d.subject, "cosmo med spa hours");
  assert.match(d.body, /^Saw Cosmo Med Spa & Salon in Alpharetta this week\.\n\nPublished hours/);
  assert.match(d.body, /tied up in a treatment/);
  assert.match(d.body, /Worth a 15 minute look\?\n\nThomas\nGates Technologies\n\nNot a fit\? Reply 'no' and I won't follow up\.$/);
  assert.deepEqual(lintPrices(d.subject, d.body), []);
});

test("template helpers", () => {
  assert.equal(shortCity("Marietta (East Cobb / Lower Roswell)"), "Marietta");
  assert.equal(shortName("Bella Forever Med Spa"), "bella forever med");
  assert.equal(shortName("Revive Health Center & Spa"), "revive health center");
  const d = templateDraft(contact({ name: "Shine Mobile Detail", batch: "ATL detailers", gap: "No booking form on the IG bio" }), signer);
  assert.equal(d.subject, "shine mobile detail front desk");
  assert.match(d.body, /out on a job/);
});

test("CAN-SPAM footer is appended to the outgoing body", () => {
  const out = composeOutgoing("Hi.\n", canSpamFooter("Gates Technologies", "123 Peachtree St, Atlanta GA"));
  assert.equal(out, "Hi.\n\n--\nGates Technologies\n123 Peachtree St, Atlanta GA");
});

// ── Price lint ──────────────────────────────────────────────────────────────

test("price lint catches money, recurring amounts, price talk and SKUs", () => {
  const hits = (s: string) => lintPrices(s).map((i) => i.rule);
  assert.ok(hits("only $97/mo").includes("Dollar amount"));
  assert.ok(hits("it's 1,000 dollars").includes("Currency word"));
  assert.ok(hits("just 250 per booked meeting").includes("Recurring amount"));
  assert.ok(hits("our pricing is simple").includes("Price talk"));
  assert.ok(hits("Speed-to-Lead agent").includes("Gates SKU"));
  assert.ok(hits("Offer 1 gets you a site").includes("Gates SKU"));
  assert.deepEqual(lintPrices("Worth a 15 minute look? Open Mon-Sat 9-5."), []);
});

// ── Workflow gates ──────────────────────────────────────────────────────────

test("happy path: draft → Nick PASS → Thomas approve → send allowed", () => {
  let c = drafted();
  assert.equal(c.stage, "drafted");
  c = step(c, { type: "submit_nick" });
  assert.equal(c.stage, "nick");
  c = step(c, { type: "nick_verdict", verdict: "PASS", note: "" });
  assert.equal(c.nickHash, c.draftHash);
  assert.equal(sendError(c, thomas)?.status, 409, "send before approve must fail");
  c = step(c, { type: "approve" }, thomas);
  assert.equal(c.stage, "approved");
  assert.equal(sendError(c, thomas), null);
});

test("Approve is gated on Nick PASS", () => {
  const c = drafted();
  const r = apply(c, { type: "approve" }, thomas);
  assert.ok(!r.ok && r.status === 409);
  const revised = step(c, { type: "nick_verdict", verdict: "REVISE", note: "too long" });
  assert.equal(revised.stage, "drafted");
  assert.ok(!apply(revised, { type: "approve" }, thomas).ok);
});

test("Approve and Send are Thomas-only by default", () => {
  const passed = step(drafted(), { type: "nick_verdict", verdict: "PASS", note: "" });
  const r = apply(passed, { type: "approve" }, ace);
  assert.ok(!r.ok && r.status === 403);
  const approved = step(passed, { type: "approve" }, thomas);
  assert.equal(sendError(approved, ace)?.status, 403);
  assert.equal(sendError(approved, { ...thomas, operator: "team" })?.status, 403);
});

test("Ace can Approve and Send once FIELD_ACE_CAN_SEND is on (team still can't)", () => {
  const aceSends: Ctx = { ...ace, aceCanSend: true };
  const passed = step(drafted(), { type: "nick_verdict", verdict: "PASS", note: "" });
  const approved = step(passed, { type: "approve" }, aceSends);
  assert.equal(approved.stage, "approved");
  assert.equal(approved.approvedBy, "ace");
  assert.equal(sendError(approved, aceSends), null);
  assert.equal(sendError(approved, { ...aceSends, operator: "team" })?.status, 403);
});

test("editing after PASS/approval clears both — Nick must re-audit", () => {
  let c = step(step(drafted(), { type: "nick_verdict", verdict: "PASS", note: "" }), { type: "approve" }, thomas);
  c = step(c, { type: "save_draft", subject: c.subject, body: c.body + "\n\nP.S. one more line", source: "manual" });
  assert.equal(c.stage, "drafted");
  assert.equal(c.nickVerdict, null);
  assert.equal(c.approvedHash, null);
  assert.ok(sendError(c, thomas));
  // Re-saving identical text is a no-op, not a reset.
  const same = apply(c, { type: "save_draft", subject: c.subject, body: c.body, source: "manual" }, ace);
  assert.ok(same.ok && Object.keys(same.patch).length === 0);
});

test("send refuses a draft that drifted from the approved hash", () => {
  const c = step(step(drafted(), { type: "nick_verdict", verdict: "PASS", note: "" }), { type: "approve" }, thomas);
  const tampered = { ...c, body: c.body + " $500", draftHash: draftHash(c.subject, c.body + " $500") };
  assert.equal(sendError(tampered, thomas)?.status, 409);
});

test("prices block Nick submit, PASS, approve and send", () => {
  const c = step(contact(), { type: "save_draft", subject: "quick idea", body: "Site is $1,000 flat.", source: "manual" });
  assert.equal((apply(c, { type: "submit_nick" }, ace) as { status: number }).status, 422);
  assert.equal((apply(c, { type: "nick_verdict", verdict: "PASS", note: "" }, ace) as { status: number }).status, 422);
});

test("Soft is Hold-only: no drafting, no release, never sendable", () => {
  const soft = contact({ priority: "Soft", stage: "hold" });
  assert.ok(!apply(soft, { type: "save_draft", subject: "a", body: "b", source: "manual" }, ace).ok);
  assert.ok(!apply(soft, { type: "release" }, ace).ok);
  const forced = { ...soft, stage: "approved" as const, subject: "a", body: "b", draftHash: draftHash("a", "b"), approvedHash: draftHash("a", "b") };
  assert.equal(sendError(forced, thomas)?.status, 422);
});

test("suppressed recipients cannot be approved or sent", () => {
  const passed = step(drafted(), { type: "nick_verdict", verdict: "PASS", note: "" });
  assert.ok(!apply(passed, { type: "approve" }, { ...thomas, suppressed: true }).ok);
  const approved = step(passed, { type: "approve" }, thomas);
  assert.equal(sendError(approved, { ...thomas, suppressed: true })?.status, 422);
});

test("sent and killed contacts are terminal", () => {
  assert.equal((apply(contact({ stage: "sent" }), { type: "hold" }, ace) as { status: number }).status, 409);
  const killed = step(drafted(), { type: "nick_verdict", verdict: "KILL", note: "wrong niche" });
  assert.equal(killed.stage, "kill");
  assert.ok(!apply(killed, { type: "release" }, ace).ok);
  assert.equal((apply(contact({ stage: "sending" }), { type: "approve" }, thomas) as { status: number }).status, 409);
});

test("hold → release returns to drafted and needs a fresh audit", () => {
  const passed = step(drafted(), { type: "nick_verdict", verdict: "PASS", note: "" });
  const held = step(passed, { type: "hold" });
  const back = step(held, { type: "release" });
  assert.equal(back.stage, "drafted");
  assert.equal(back.nickVerdict, null);
});

// ── CSV fallback ────────────────────────────────────────────────────────────

test("CSV parses quoted multi-line bodies and maps columns", () => {
  const csv = 'Name,To,Priority,City,Gap,Body\r\n"Pele Aesthetics",info@spapele.com,High,Marietta,"Closed Sunday, appt only","Line 1\n\nLine ""2"""\nSoft Co,soft@x.com,soft,,,\n';
  const rows = csvToRows(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].gap, "Closed Sunday, appt only");
  assert.equal(rows[0].body, 'Line 1\n\nLine "2"');
  assert.equal(rows[0].priority, "High");
  assert.equal(rows[1].priority, "Soft");
  assert.throws(() => csvToRows("Business,Phone\nx,1"), /Name and To/);
});
