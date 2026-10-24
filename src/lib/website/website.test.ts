/**
 * Website Blueprint — brief, launch checklist, website-lane audit wiring. Run: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { websiteBrief } from "./brief";
import { WEBSITE_BLUEPRINT } from "./blueprint";
import { LAUNCH_CHECKLIST, checklistAuditLines } from "./checklist";
import { playbookPrompt } from "../field/playbook";
import { websiteEmail1Lint } from "../field/lint";
import type { FieldContact } from "../field/types";

const signer = { name: "Thomas Gates III", company: "Gates Technologies", site: "gatestech.solutions" };
const lead = { id: "c1", name: "Peach State Epoxy", city: "Macon", siteUrl: "https://peach.example", gap: "", notes: "", lane: "website" } as unknown as FieldContact;

test("launch checklist has exactly 20 numbered items matching the blueprint doc", () => {
  assert.deepEqual(LAUNCH_CHECKLIST.map((i) => i.n), Array.from({ length: 20 }, (_, i) => i + 1));
  for (const i of LAUNCH_CHECKLIST) assert.ok(WEBSITE_BLUEPRINT.includes(`${i.n}. **${i.label}**`), `doc is missing "${i.n}. **${i.label}**"`);
  assert.equal(checklistAuditLines().split("\n").length, 20);
});

test("generated blueprint module matches docs/website-blueprint.md (run npm run website:sync)", () => {
  assert.equal(WEBSITE_BLUEPRINT, readFileSync("docs/website-blueprint.md", "utf8"));
});

test("blueprint keeps the four layout rules", () => {
  for (const s of ["scroll past the hero right away", "See the Transformation", "Label AI-generated before/after visuals as illustrations", "Verified Google reviews only, never invented", "GoHighLevel webhook"]) {
    assert.ok(WEBSITE_BLUEPRINT.includes(s), s);
  }
});

test("brain_website_brief carries the blueprint, checklist and build-message rule", () => {
  const b = websiteBrief(lead);
  assert.equal(b.blueprint, WEBSITE_BLUEPRINT);
  assert.equal(b.launch_checklist.length, 20);
  assert.deepEqual(b.launch_checklist[0], { n: 1, label: "Privacy Policy" });
  assert.match(b.build_message, /Follow the Gates Website Blueprint/);
  assert.match(b.build_message, /all 20 launch checklist items before opening a PR/);
});

test("website Email 1 prompt picks fixes from checklist gaps in owner words", () => {
  const p = playbookPrompt({ ...lead, batch: "" }, signer, 1, [], "Launch checklist gaps:\n#3 Clear CTA above the fold: no call button");
  assert.match(p, /Launch checklist gaps/);
  assert.match(p, /Google shows no description under your name/);
});

test("website lint flags checklist jargon in a cold email", () => {
  const body = "Noticed a few things.\n\nThree things I'd fix:\n1. Add a meta description.\n2. Add a sitemap.\n3. Fix the favicon.\n\nWe build sites with booking built in.\n\nWant me to walk you through them?";
  const hits = websiteEmail1Lint(body).filter((i) => i.rule === "Website jargon").map((i) => i.match.toLowerCase());
  assert.deepEqual(hits, ["meta description", "sitemap", "favicon"]);
});
