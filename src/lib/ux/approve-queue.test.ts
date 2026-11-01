import { test } from "node:test";
import assert from "node:assert/strict";
import { approveQueue, approvedUnsent, capLeft, isPhoneUA, statusLine, swipeAction, type QueueLead } from "./approve-queue";

const lead = (id: string, over: Partial<QueueLead> = {}): QueueLead => ({
  contact_id: id, business: id, contact_name: null, email: `${id}@x.test`, tier: "Med", email1_status: "PASS", suppressed: false, lint_issues: 0, ...over,
});

test("approveQueue: only clean, unsuppressed Nick PASS drafts, High first", () => {
  const leads = [
    lead("b", { tier: "Med" }),
    lead("a", { tier: "High" }),
    lead("drafted", { email1_status: "drafted" }),
    lead("approved", { email1_status: "approved" }),
    lead("supp", { suppressed: true }),
    lead("lint", { lint_issues: 2 }),
  ];
  assert.deepEqual(approveQueue(leads).map((l) => l.contact_id), ["a", "b"]);
});

test("approveQueue: a card in its undo window is hidden", () => {
  assert.deepEqual(approveQueue([lead("a"), lead("b")], new Set(["a"])).map((l) => l.contact_id), ["b"]);
});

test("approvedUnsent: approved and not suppressed", () => {
  const leads = [lead("x", { email1_status: "approved" }), lead("y", { email1_status: "approved", suppressed: true }), lead("z", { email1_status: "sent" })];
  assert.deepEqual(approvedUnsent(leads).map((l) => l.contact_id), ["x"]);
});

test("statusLine and capLeft", () => {
  assert.equal(statusLine({ waiting: 6, sent: 0, cap: 10, warmed: false }), "6 waiting · 0 sent · cap 10 · warm-up ✗");
  assert.equal(capLeft(3, 10), 7);
  assert.equal(capLeft(12, 10), 0);
});

test("isPhoneUA: phones yes, tablets and desktops no", () => {
  assert.equal(isPhoneUA("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148"), true);
  assert.equal(isPhoneUA("Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36"), true);
  assert.equal(isPhoneUA("Mozilla/5.0 (Linux; Android 15; Pixel Tablet) AppleWebKit/537.36 Chrome/130 Safari/537.36"), false);
  assert.equal(isPhoneUA("Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)"), false);
  assert.equal(isPhoneUA("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1.15"), false);
  assert.equal(isPhoneUA(null), false);
});

test("swipeAction thresholds", () => {
  assert.equal(swipeAction(120), "approve");
  assert.equal(swipeAction(-120), "hold");
  assert.equal(swipeAction(40), null);
});
