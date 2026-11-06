/** Smoke check of the built app with no real services behind it: sign-in, the gate, and every main page rendering. */
import { expect, test, type Page } from "@playwright/test";
import { CRON_SECRET, THOMAS_PASSWORD } from "../../playwright.config";

async function signIn(page: Page, password: string) {
  await page.goto("/sign-in");
  await page.getByTestId("password-input").fill(password);
  await page.getByTestId("signin-submit").click();
}

test("signed-out visitors are sent to sign-in", async ({ page }) => {
  await page.goto("/operations");
  await expect(page).toHaveURL(/\/sign-in\?callbackUrl=%2Foperations/);
  await expect(page.getByTestId("signin-form")).toBeVisible();
});

test("a wrong password is refused", async ({ page }) => {
  await signIn(page, "not-the-password");
  await expect(page.getByTestId("signin-error")).toBeVisible();
});

test("signed-in pages render without a browser crash", async ({ page }) => {
  const crashes: string[] = [];
  page.on("pageerror", (e) => crashes.push(`${page.url()}: ${e.message}`));
  await signIn(page, THOMAS_PASSWORD);
  await expect(page).not.toHaveURL(/sign-in/);
  for (const path of ["/", "/leads", "/field", "/content", "/operations", "/m"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBeLessThan(500);
  }
  await page.goto("/operations");
  // No database behind this run, so the panel has to say it couldn't load instead of looking empty.
  await expect(page.getByTestId("approvals-error")).toBeVisible();
  expect(crashes).toEqual([]);
});

test("the browser allows the microphone for voice input", async ({ page }) => {
  await page.goto("/sign-in");
  const allowed = await page.evaluate(() => (document as unknown as { featurePolicy: { allowsFeature(f: string): boolean } }).featurePolicy.allowsFeature("microphone"));
  expect(allowed).toBe(true);
});

test("sign-in fits a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/sign-in");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("APIs refuse callers without credentials", async ({ request }) => {
  expect((await request.get("/api/approvals")).status()).toBe(401);
  expect((await request.get("/api/cron/morning-briefing")).status()).toBe(401);
  expect((await request.get("/api/cron/morning-briefing", { headers: { Authorization: "Bearer wrong" } })).status()).toBe(401);
  expect((await request.get("/api/cron/not-a-job", { headers: { Authorization: `Bearer ${CRON_SECRET}` } })).status()).toBe(404);
});

test("health reports the database being down, with no details", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(503);
  expect(await res.json()).toEqual({ ok: false, db: false });
});
