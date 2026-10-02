/**
 * Field Console — gate + playbook tests. Run: npm test
 * Covers the PRD's acceptance gates that live in pure logic.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { lintCopy } from "./lint";
import { templateDraft, shortCity, shortName, composeOutgoing, canSpamFooter, cleanGap, PLAYBOOK_SYSTEM, playbookPrompt } from "./playbook";
import { apply, draftHash, sendError, type Ctx } from "./workflow";
import { csvToRows } from "./csv";
import type { FieldContact } from "./types";

const signer = { name: "Thomas Gates III", company: "Gates Technologies", site: "gatestech.solutions" };
const now = "2026-10-01T13:00:00.000Z";
const thomas: Ctx = { operator: "thomas", suppressed: false, now };
const ace: Ctx = { operator: "ace", suppressed: false, now };

function contact(over: Partial<FieldContact> = {}): FieldContact {
  return {
    id: "c1", source: "notion", notionPageId: "p1", name: "Cosmo Med Spa & Salon", email: "hi@cosmo.example",
    city: "Alpharetta", batch: "2026-09-24 ATL med spa", gap: "Published hours are Tuesday-Saturday 9-5 with Sunday and Monday closed",
    priority: "High", packDate: "2026-10-01", stage: "new", subject: "", body: "", draftSource: null, draftHash: null,
    nickVerdict: null, nickNote: null, nickHash: null, nickAt: null, nickBy: null, approvedHash: null, approvedAt: null,
    approvedBy: null, sentAt: null, lastError: null, updatedAt: now,
    lane: "core", contactName: null, siteUrl: null, notes: null, repliedAt: null, ...over,
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

test("template follows the outreach brief shape and passes the copy lint", () => {
  const d = templateDraft(contact(), signer);
  assert.equal(d.subject, "calls after you close");
  assert.match(d.body, /^Published hours are Tuesday-Saturday 9-5 with Sunday and Monday closed\.\n\nSo a call after you close has nowhere to go\./);
  assert.match(d.body, /Worth a look, or do you have that covered already\?\n\nThomas Gates III\nGates Technologies · gatestech\.solutions$/);
  assert.doesNotMatch(d.body, /Alpharetta/); // no city unless it's relevant
  assert.deepEqual(lintCopy(d.subject, d.body), []);
});

test("template: non-hours gap, missing gap, and gap cleanup", () => {
  assert.equal(shortCity("Marietta (East Cobb / Lower Roswell)"), "Marietta");
  assert.equal(shortName("Revive Health Center & Spa"), "revive health center");
  const d = templateDraft(contact({ name: "Shine Mobile Detail", batch: "ATL detailers", gap: "No booking form on the IG bio" }), signer);
  assert.equal(d.subject, "missed calls at shine mobile detail");
  assert.match(d.body, /while you're out on a job/);
  const generic = templateDraft(contact({ gap: "" }), signer);
  assert.match(generic.body, /^When the phone rings and nobody can pick up/);
  assert.deepEqual(lintCopy(generic.subject, generic.body), []);
  assert.equal(cleanGap("Closed weekends — phone only"), "Closed Saturdays and Sundays, phone only.");
  assert.equal(cleanGap("Appointment-only all week"), "Appointment-only every day.");
});

test("Claude prompt gets the cleaned gap (no banned words to copy)", () => {
  const p = playbookPrompt(contact({ gap: "Hours end weekdays at 5 — closed weekends" }), signer);
  assert.match(p, /Observed gap: Hours end Monday to Friday at 5, closed Saturdays and Sundays\./);
});

test("Claude prompt carries the full outreach brief", () => {
  assert.match(PLAYBOOK_SYSTEM, /<outreach_brief>[\s\S]*The one rule that matters most[\s\S]*<\/outreach_brief>/);
});

test("CAN-SPAM footer (address + opt-out) is appended to the outgoing body", () => {
  const out = composeOutgoing("Hi.\n", canSpamFooter("3800 Camp Creek Pkwy, Atlanta, GA 30331"));
  assert.equal(out, `Hi.\n\n3800 Camp Creek Pkwy, Atlanta, GA 30331\nReply "no" and I won't write again.`);
});

// ── Copy lint (outreach brief "never assert") ───────────────────────────────

test("copy lint enforces the outreach brief", () => {
  const hits = (subject: string, body = "") => lintCopy(subject, body).map((i) => i.rule);
  assert.ok(hits("only $97/mo").includes("Dollar amount"));
  assert.ok(hits("it's 1,000 dollars").includes("Currency word"));
  assert.ok(hits("just 250 per booked meeting").includes("Recurring amount"));
  assert.ok(hits("our pricing is simple").includes("Price talk"));
  assert.ok(hits("Speed-to-Lead agent").includes("Gates SKU"));
  assert.ok(hits("bookings up 34%").includes("Percentage"));
  assert.ok(hits("we've helped 50+ med spas").includes("Client claim"));
  for (const w of ["this week", "weekends", "weekly", "a weak spot"]) assert.ok(hits(w).includes("Banned word"), w);
  assert.ok(hits("calls — and texts").includes("Em dash"));
  assert.ok(hits("our HIPAA-compliant agent").includes("HIPAA claim"));
  assert.ok(hits("never miss a call again").includes("Banned phrase"));
  assert.ok(hits("I hope this email finds you well").includes("Banned phrase"));
  assert.ok(hits("it won't replace your front desk").includes("Replaces staff"));
  assert.ok(hits("Great!").includes("Exclamation mark"));
  assert.ok(hits("RE: your hours").includes("Fake reply subject"));
  assert.ok(hits("s", Array(111).fill("word").join(" ")).includes("Too long"));
  assert.ok(hits("s", "https://a.example and https://b.example").includes("Too many links"));
  assert.deepEqual(lintCopy("calls after you close", "HIPAA-aware where that scope applies. Open Mon-Sat 9-5. Worth a look?"), []);
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

// ── Sequence, lanes, inbound ────────────────────────────────────────────────

import { dueDate, addDays, STEP_OFFSET_DAYS } from "./sequence";
import { followupTemplate } from "./playbook";
import { classifyReply, firstWords } from "./inbound";

test("sequence due dates: Day 1/3/7/12 from the Email 1 send date (ET)", () => {
  assert.deepEqual(STEP_OFFSET_DAYS, { 1: 0, 2: 2, 3: 6, 4: 11 });
  const sent = "2026-10-01T15:00:00.000Z"; // 11am ET, Oct 1
  assert.equal(dueDate(sent, 2), "2026-10-03");
  assert.equal(dueDate(sent, 3), "2026-10-07");
  assert.equal(dueDate(sent, 4), "2026-10-12");
  assert.equal(dueDate("2026-10-02T02:30:00.000Z", 2), "2026-10-03"); // 10:30pm ET Oct 1 counts as Oct 1
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("follow-up and website templates pass the copy lint", () => {
  for (const n of [2, 3, 4] as const) {
    for (const lane of ["core", "website"] as const) {
      const d = followupTemplate(n, { name: "Palma Aesthetics", subject: "calls after you close", lane }, signer);
      assert.equal(d.subject, "calls after you close");
      assert.deepEqual(lintCopy(d.subject, d.body), [], `Email ${n} ${lane}`);
    }
  }
  const w = templateDraft(contact({ lane: "website", gap: "" }), signer);
  assert.match(w.body, /rebuild the site with booking built in/);
  assert.deepEqual(lintCopy(w.subject, w.body), []);
});

test("voice lint: dashes, clause hyphens and AI-isms; compounds are fine", () => {
  const rules = (t: string) => lintCopy("s", t).map((i) => i.rule);
  assert.ok(rules("calls go out – fast").includes("En dash"));
  assert.ok(rules("calls go out - fast").includes("Clause hyphen"));
  assert.ok(rules("I put together a one-pager for you").includes("AI-ism"));
  assert.ok(rules("I pulled a teardown of your site").includes("AI-ism"));
  assert.ok(rules("Quick question about your outbound").includes("Banned phrase"));
  assert.deepEqual(lintCopy("calls after you close", "We answer after-hours calls and text back. Worth a look?"), []);
  assert.equal(cleanGap("Open Tuesday–Saturday 9–5 - phone only"), "Open Tuesday to Saturday 9 to 5, phone only.");
});

test("inbound classifier: opt-out, not-now, auto-reply, bounce, real reply", () => {
  assert.equal(classifyReply("No", "a@b.com").action, "suppress_opt_out");
  assert.equal(classifyReply("no thanks\n\nOn Tue, Thomas wrote:\n> Worth a look?", "a@b.com").action, "suppress_opt_out");
  assert.equal(classifyReply("Please remove me from your list", "a@b.com").action, "suppress_opt_out");
  assert.equal(classifyReply("Not right now, maybe next quarter.", "a@b.com").action, "soft_hold");
  assert.equal(classifyReply("I'm out of the office until Monday.", "a@b.com").action, "ignore");
  assert.equal(classifyReply("Delivery Status Notification (Failure)", "mailer-daemon@googlemail.com").action, "ignore");
  assert.equal(classifyReply("Yes, how does the text-back work with Boulevard?", "a@b.com").action, "reply_handoff_lisa");
  assert.equal(firstWords("Sounds good\n> quoted\nOn Mon, X wrote:\nold"), "Sounds good");
});

import { websiteEmail1Lint, lintDraft } from "./lint";
import { normBusiness } from "./leads";

test("website Email 1: exactly three numbered fixes, no links, no attachments", () => {
  const good = "Your site only has a contact page.\n\nThree things I'd fix:\n1. Add a Book Now button at the top.\n2. List your services on the homepage.\n3. Put your hours under the phone number.\n\nWorth a look?\n\nThomas Gates III\nGates Technologies · gatestech.solutions";
  assert.deepEqual(websiteEmail1Lint(good), []);
  assert.deepEqual(lintDraft("three fixes for your site", good, { lane: "website" }), []);
  assert.ok(websiteEmail1Lint(good.replace("3. Put your hours under the phone number.\n", "")).some((i) => i.rule === "Website fixes"));
  assert.ok(websiteEmail1Lint(good + "\n4. One more.").some((i) => i.rule === "Website fixes"));
  assert.ok(websiteEmail1Lint(good + "\nSee https://example.org/audit").some((i) => i.rule === "Link in website Email 1"));
  assert.ok(websiteEmail1Lint(good + "\nI attached a PDF.").some((i) => i.rule === "Attachment mention"));
  // core lane and follow-ups don't need the three fixes
  assert.deepEqual(lintDraft("calls after you close", "Worth a look?", { lane: "core" }), []);
  assert.deepEqual(lintDraft("x", "Following up. Worth a look?", { lane: "website", emailN: 2 }), []);
});

test("business-name matching for duplicates", () => {
  assert.equal(normBusiness("Heaven's Handyman (Heavens Handyman LLC)"), "heaven s handyman");
  assert.equal(normBusiness("All Trades Inc. (All Trades General Contracting)"), "all trades");
  assert.equal(normBusiness("Kulani Spa & Wellness"), "kulani spa wellness");
});
