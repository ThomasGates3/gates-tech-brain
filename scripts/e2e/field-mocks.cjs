// Seeded, fake Field data for screenshots and the /m flow test. Nothing here touches a real API:
// every /api/* call is answered by Playwright, and the send tool is answered with the server's 423 warm-up refusal.
const L = (id, business, over = {}) => ({
  contact_id: id, business, contact_name: null, email: `owner@${id}.example`, lane: "core", source: "test", tier: "High",
  email1_status: "PASS", nick_verdict: "PASS", nick_note: "Tight, specific, no price.", approved: false, sent_at: null,
  subject: `Quick question about ${business}`, lint_issues: 0, suppressed: false, replied: false, duplicate_of: [], hold_reason: null,
  revise_pending: false, booked: false, paid_offer: null, duplicates: [], next_action: "Approve", sent: false, pack_date: "2026-11-01", ...over,
});
const base = [
  L("test-plumb", "Test Plumbing Co", { contact_name: "Sam" }),
  L("test-hvac", "Seed HVAC Services", { tier: "Med" }),
  L("test-roof", "Example Roofing", { tier: "Med" }),
  L("test-dental", "Demo Dental", { email1_status: "approved", approved: true, next_action: "Send" }),
  L("test-auto", "Sample Auto Body", { email1_status: "drafted", nick_verdict: null, nick_note: null, next_action: "Nick audit" }),
];
const body = (b) => `Hi there,\n\nI was looking at ${b} and noticed new customers have to call during business hours to book. A lot of people search at night and move on when nobody answers.\n\nWe set up a simple booking line that answers after hours and puts the job on your calendar.\n\nWorth a 10-minute look this week?\n\nThomas\nGates Technologies`;

async function install(page, calls) {
  // Stateful per page, like the server: approve → approved, hold → hold, edit → drafted (PASS cleared).
  const leads = base.map((l) => ({ ...l }));
  // Hide the dev-only Next.js badge (it sits over the bottom tab bar in `next dev`).
  await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => {
    const st = document.createElement("style"); st.textContent = "nextjs-portal{display:none!important}"; document.head.appendChild(st);
  }));
  const set = (id, patch) => Object.assign(leads.find((x) => x.contact_id === id) ?? {}, patch);
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (status, d) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(d) });
    if (p === "/api/leads") {
      return json(200, { date: "2026-11-01", sentToday: 0, gates: { domainWarmed: false, warmNote: "Fixture: warm-up not confirmed", dailyCap: 10 },
        counts: { core: 5, website: 0, drafted: 1, awaitingNick: 1, passAwaitingApprove: 3, approvedUnsent: 1, softHold: 0, total: 5, duplicates: 0 }, leads });
    }
    if (p.startsWith("/api/v1/tools/")) {
      const name = p.split("/").pop();
      const args = req.postDataJSON() ?? {};
      calls.push({ name, args });
      if (name === "brain_get_draft") {
        const l = leads.find((x) => x.contact_id === args.contact_id);
        return json(200, { ok: true, result: { name: l.business, email: l.email, contact_name: l.contact_name, subject: l.subject, body: body(l.business), footer: "Gates Technologies · [mailing address] · Reply STOP to opt out", stage: l.email1_status, draft_source: "claude", nick: { verdict: "PASS", note: l.nick_note, on_current_draft: true }, approved: false, approved_by: null, lint: [], gap: "", site_url: null, email_n: 1 } });
      }
      if (name === "brain_approve") set(args.contact_id, { email1_status: "approved", approved: true });
      if (name === "brain_hold") set(args.contact_id, { email1_status: args.hold ? "hold" : "drafted" });
      if (name === "brain_set_draft") set(args.contact_id, { email1_status: "drafted", nick_verdict: null, body: args.body });
      if (name === "brain_approve_send") return json(423, { ok: false, error: "Send blocked: domain warm-up not confirmed (brain_set_gate)" });
      return json(200, { ok: true, result: {} });
    }
    if (p === "/api/deck") {
      return json(200, {
        briefing: { lead: "3 PASS drafts waiting on your approval", items: [], next: ["Approve 3 Nick-PASS drafts", "Confirm warm-up before any send"] },
        ops: [], scoreboard: { sent: { value: 0, cap: 10 }, passAwaitingApprove: 3, approvedUnsent: 1, core: 5, website: 0, inboundUnanswered: 1, sequenceDue: 0, domainWarmed: false, warmNote: "Fixture" },
        budget: { spentUsd: 0.42, capUsd: 5.5, warnUsd: 3, status: "ok" },
        readouts: { tier: "SONNET", activeAgents: 3, sent: "0/10", claude: "$0.42/$5.50" },
      });
    }
    if (p === "/api/inbound") {
      return json(200, { matched: [{ thread_id: "t1", from: "owner@test-plumb.example", subject: "Re: Quick question", snippet: "Sure, can you call me Tuesday afternoon?", last_at: "2026-11-01T15:00:00Z", unanswered: true, suggested: "reply_handoff_lisa", reason: "wants a call", contact: { contact_id: "test-plumb", name: "Test Plumbing Co", lane: "core", stage: "sent" } }], unmatched: [] });
    }
    if (p === "/api/automations") return json(200, { automations: [{ id: "morning-briefing", name: "Morning briefing" }] });
    if (p === "/api/activity") return json(200, { activity: [
      { id: "a1", kind: "generated", target: "Drafted Email 1 for Test Plumbing Co", agent: "darrell", at: new Date(Date.now() - 6e5).toISOString() },
      { id: "a2", kind: "updated", target: "Nick PASS on Seed HVAC Services", because: "Specific, no price, clean lint", agent: "nick", at: new Date(Date.now() - 3e5).toISOString() },
      { id: "a3", kind: "alert", target: "Send blocked for Demo Dental", because: "Warm-up not confirmed", agent: "ace", at: new Date(Date.now() - 6e4).toISOString() },
    ] });
    if (p === "/api/usage") return json(200, { tokens: 18400, spendUsd: 0.42, avgLatencyMs: 2100, calls: 7, modelTier: "standard" });
    return json(200, {});
  });
}
module.exports = { install, leads: base };
