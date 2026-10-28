import { test } from "node:test";
import assert from "node:assert/strict";
import { CADENCE_MATRIX, DAYS, dayTotal, seedState, slotsFor, weekTotals, type DayOfWeek } from "./studio";

const SLOW: Record<DayOfWeek, number> = { monday: 2, tuesday: 1, wednesday: 2, thursday: 2, friday: 2, saturday: 0, sunday: 2 };
const FAST: Record<DayOfWeek, number> = { monday: 4, tuesday: 3, wednesday: 3, thursday: 3, friday: 4, saturday: 0, sunday: 4 };

test("cadence matrix matches the @brandisocial slot counts", () => {
  for (const d of DAYS) {
    assert.equal(dayTotal(d, "slow"), SLOW[d], `slow ${d}`);
    assert.equal(dayTotal(d, "fast"), FAST[d], `fast ${d}`);
  }
  assert.deepEqual(weekTotals("slow"), { reel: 3, carousel: 1, story: 7 });
  assert.deepEqual(weekTotals("fast"), { reel: 5, carousel: 4, story: 12 });
});

test("seed pack fills every slot in both modes with the right formats", () => {
  const s = seedState(new Date("2026-10-27T15:00:00Z"));
  assert.equal(s.items.length, 22);
  assert.equal(new Set(s.items.map((i) => i.id)).size, 22);
  for (const mode of ["slow", "fast"] as const) {
    let total = 0;
    for (const d of DAYS) {
      const slots = slotsFor(s, d, mode);
      total += slots.length;
      const want = CADENCE_MATRIX[d][mode];
      for (const f of ["reel", "carousel", "story"] as const) assert.equal(slots.filter((x) => x.format === f).length, want[f], `${mode} ${d} ${f}`);
    }
    assert.equal(total, mode === "slow" ? 11 : 21);
  }
  assert.equal(s.weekOf, "2026-10-26");
});

test("Saturday is always off and Sunday is the 7:30 PM ET night drop", () => {
  assert.equal(CADENCE_MATRIX.saturday.restDay, true);
  assert.equal(dayTotal("saturday", "fast"), 0);
  assert.equal(CADENCE_MATRIX.sunday.nightDrop, true);
  assert.match(CADENCE_MATRIX.sunday.postingTimeEt, /7:30 PM ET Night Drop/);
});

test("seed copy follows the Brain rules: no em dashes, no invented percentages", () => {
  const s = seedState();
  for (const i of s.items) {
    const text = [i.title, i.topPillHook, i.topPillAlt ?? "", i.caption, i.ghlDmScript, ...i.shotList].join(" ");
    assert.doesNotMatch(text, /[—–]/, i.id);
    assert.doesNotMatch(text, /\d+(\.\d+)?\s?%\s+of\b/i, i.id); // stats like "78% of homeowners", not poll labels
    assert.ok(i.ghlKeyword, i.id);
    // Every demo links its live site, except the showerhead demo, which has none yet.
    if (i.demoSlug === "filtered-shower-store") assert.equal(i.siteUrl, "", i.id);
    else assert.match(i.siteUrl, /^https:\/\/[a-z0-9-]+\.vercel\.app$/, i.id);
  }
});

test("content tools are registered and answer without a database", async () => {
  const { getTool, callTool } = await import("../brain/tools");
  for (const n of ["brain_content_today", "brain_content_list", "brain_content_upsert", "brain_content_generate_week"]) assert.ok(getTool(n), n);
  const ctx = { operator: "ace" as const, via: "rest" as const };
  const today = await callTool("brain_content_today", { agent: "ace", day_of_week: "tuesday", mode: "fast" }, ctx);
  assert.equal(today.ok, true);
  if (today.ok) assert.equal((today.result as { slots: unknown[] }).slots.length, 3);
  const list = await callTool("brain_content_list", { agent: "ace", mode: "slow" }, ctx);
  assert.equal(list.ok, true);
  if (list.ok) assert.equal((list.result as { items: unknown[] }).items.length, 11);
  const bad = await callTool("brain_content_upsert", { agent: "ace", id: "mon-reel-1", caption: "Big win — today" }, ctx);
  assert.equal(bad.ok, false);
  const missing = await callTool("brain_content_upsert", { agent: "ace", id: "nope", status: "posted" }, ctx);
  assert.equal(missing.ok, false);
});
