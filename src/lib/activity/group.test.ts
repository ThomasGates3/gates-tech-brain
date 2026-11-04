/** Activity grouping tests. Run: npm test */
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupActivity } from "./group";

const row = (id: string, target: string, ts: string, agent = "prospectacle", kind = "updated") => ({ id, target, ts, agent, kind });

test("same-day adds by one agent collapse into one row", () => {
  const out = groupActivity([
    row("1", "Prospectacle added RM Construction Group, LLC", "2026-11-04T15:00:00"),
    row("2", "Darrell drafted Email 1 for Acme Roofing", "2026-11-04T14:30:00", "darrell"),
    row("3", "Prospectacle added United Family Homes LLC", "2026-11-04T14:00:00"),
    row("4", "Prospectacle added 180 Renovations LLC", "2026-11-04T13:00:00"),
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].type, "group");
  if (out[0].type === "group") {
    assert.equal(out[0].summary, "Prospectacle added 3 leads");
    assert.deepEqual(out[0].items.map((i) => i.id), ["1", "3", "4"]);
  }
  assert.equal(out[1].type, "single");
});

test("different days stay separate, singles stay single", () => {
  const out = groupActivity([
    row("1", "Prospectacle added A LLC", "2026-11-04T15:00:00"),
    row("2", "Prospectacle added B LLC", "2026-11-03T15:00:00"),
  ]);
  assert.deepEqual(out.map((e) => e.type), ["single", "single"]);
});

test("drafts group per email number", () => {
  const out = groupActivity([
    row("1", "Darrell drafted Email 1 for A with Claude", "2026-11-04T15:00:00", "darrell"),
    row("2", "Darrell drafted Email 1 for B", "2026-11-04T14:00:00", "darrell"),
    row("3", "Darrell drafted Email 2 for C", "2026-11-04T13:00:00", "darrell"),
  ]);
  assert.equal(out[0].type === "group" && out[0].summary, "Darrell drafted Email 1 for 2 leads");
  assert.equal(out[1].type, "single");
});
