import { defineConfig } from "@playwright/test";

const PORT = 3100;
export const THOMAS_PASSWORD = "e2e-thomas";
export const CRON_SECRET = "e2e-cron";

// Runs the built app with stand-in values. Blanking the integrations overrides .env.local,
// so a local run can't touch the real database, AgentMail, Discord or Claude.
export default defineConfig({
  testDir: "tests/e2e",
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/sign-in`,
    reuseExistingServer: false,
    env: {
      AUTH_SECRET: "e2e-secret",
      CRON_SECRET,
      FIELD_THOMAS_PASSWORD: THOMAS_PASSWORD,
      ACCESS_PASSWORD: "e2e-team",
      DATABASE_URL: "postgresql://e2e:e2e@localhost:1/e2e",
      ANTHROPIC_API_KEY: "",
      AGENTMAIL_API_KEY: "",
      AGENTMAIL_INBOX_ID: "",
      DISCORD_WEBHOOK_URL: "",
      SLACK_WEBHOOK_URL: "",
      NOTION_TOKEN: "",
      ELEVENLABS_API_KEY: "",
    },
  },
});
