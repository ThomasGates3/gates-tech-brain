/**
 * Phone approve view (/m) end-to-end check, at 390×844 with seeded fake contacts.
 * Every /api call is mocked (scripts/e2e/field-mocks.cjs), so nothing real is approved or sent.
 * The send tool answers with the server's warm-up 423, proving /m stops and shows why.
 *
 *   npm run dev            # in another terminal
 *   node scripts/e2e/m-approve.e2e.cjs [baseUrl] [videoDir]
 */
const { chromium, devices } = require("playwright");
const assert = require("node:assert/strict");
const { install } = require("./field-mocks.cjs");

const base = process.argv[2] ?? "http://localhost:3000";
const videoDir = process.argv[3];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 }, ...(videoDir && { recordVideo: { dir: videoDir, size: { width: 390, height: 844 } } }) });
  const page = await ctx.newPage();
  const calls = [];
  await install(page, calls);
  const called = (name) => calls.filter((c) => c.name === name);

  // Phones opening / are sent to /m.
  await page.goto(base + "/");
  await page.waitForURL("**/m");
  await page.getByTestId("m-body").waitFor();
  assert.match(await page.getByTestId("m-status").innerText(), /3 waiting · 0 sent · cap 10 · warm-up ✗/);
  assert.equal(await page.getByTestId("m-business").innerText(), "Test Plumbing Co"); // High tier first
  await page.getByTestId("m-warmup").waitFor();
  await page.getByTestId("m-inbox").waitFor();

  // Swipe right = approve, committed after the 5s undo window.
  const card = page.locator("article.swipe-card");
  const box = await card.boundingBox();
  const y = box.y + 140; // near the top: the card can be taller than the screen
  await page.mouse.move(box.x + 60, y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(box.x + 60 + i * 18, y); await wait(16); }
  await page.mouse.up();
  await page.getByTestId("toast-action").waitFor();
  assert.equal(await page.getByTestId("m-business").innerText(), "Example Roofing");
  assert.equal(called("brain_approve").length, 0, "not committed during undo window");
  await wait(5600);
  assert.deepEqual(called("brain_approve").map((c) => c.args.contact_id), ["test-plumb"]);

  // Hold, then Undo: nothing is called.
  await page.getByTestId("m-hold").click();
  await page.getByTestId("toast-action").click();
  await wait(5600);
  assert.equal(called("brain_hold").length, 0, "undo cancels the hold");
  await page.getByTestId("m-hold").click();
  await wait(5600);
  assert.deepEqual(called("brain_hold").map((c) => c.args), [{ contact_id: "test-roof", hold: true }]);

  // Edit: saving rewrites the draft (server clears PASS and sends it back to Nick).
  await page.getByTestId("m-edit").click();
  await page.getByTestId("m-edit-sheet").waitFor();
  await page.locator("#m-body").fill("Hi,\n\nShorter version.\n\nThomas");
  await page.getByTestId("m-edit-save").click();
  await page.getByTestId("m-edit-sheet").waitFor({ state: "detached" });
  const sd = called("brain_set_draft")[0].args;
  assert.equal(sd.contact_id, "test-hvac");
  assert.equal(sd.body, "Hi,\n\nShorter version.\n\nThomas");

  // Send: confirm sheet lists recipients, needs two taps, goes one at a time, stops on the 423.
  await page.getByTestId("m-send-open").click();
  await page.getByTestId("m-send-list").waitFor();
  assert.match(await page.getByTestId("m-send-list").innerText(), /Demo Dental/);
  await page.getByTestId("m-send-confirm").click();
  assert.equal(called("brain_approve_send").length, 0, "first tap only arms");
  await page.getByTestId("m-send-confirm").click();
  await page.getByText("stopped").waitFor();
  // The swipe-approved lead and the pre-approved one are both listed; the first refusal stops the batch.
  assert.match(await page.getByTestId("m-send-list").innerText(), /Test Plumbing Co/);
  const sends = called("brain_approve_send");
  assert.equal(sends.length, 1, "stops after the first refusal");
  assert.equal(sends[0].args.confirm, true);
  await page.getByText(/warm-up not confirmed/).first().waitFor();

  // Tabs: pipeline shows the gauges and flow, replies lists the inbox, back to approve.
  await page.getByTestId("m-send-sheet").getByRole("button", { name: /Done|Close/ }).first().click();
  await page.getByTestId("m-tab-pipeline").click();
  await page.getByTestId("m-ring-sends").waitFor();
  await page.getByTestId("pipeline").waitFor();
  await page.getByTestId("m-tab-inbox").click();
  assert.match(await page.getByTestId("m-inbox-list").innerText(), /Tuesday afternoon/);
  await page.getByTestId("m-tab-approve").click();
  await page.getByTestId("m-status").waitFor();

  await ctx.close();
  await browser.close();
  console.log("m-approve e2e: all checks passed");
})().catch((e) => { console.error(e); process.exit(1); });
