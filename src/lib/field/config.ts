/**
 * Field Console server config — env-driven, read per request. Server-only.
 */
import { cookies } from "next/headers";
import { GATE_COOKIE, gateEnabled, readSession } from "@/lib/gate";
import type { Operator } from "./types";
import type { Signer } from "./playbook";

const env = (k: string) => process.env[k]?.trim() || "";

export const fieldEnv = {
  timezone: () => env("FIELD_TIMEZONE") || "America/New_York",
  database: () => Boolean(env("DATABASE_URL")),
  notionToken: () => env("NOTION_TOKEN"),
  notionDataSource: () => env("NOTION_COLD_EMAILS_DATA_SOURCE_ID"),
  agentmailKey: () => env("AGENTMAIL_API_KEY"),
  agentmailInbox: () => env("AGENTMAIL_INBOX_ID"),
  agentmailBase: () => env("AGENTMAIL_BASE_URL") || "https://api.agentmail.to",
  claude: () => Boolean(env("AI_GATEWAY_API_KEY") || env("VERCEL_OIDC_TOKEN")),
  mailingAddress: () => env("FIELD_MAILING_ADDRESS"),
  domainWarmed: () => env("FIELD_DOMAIN_WARMED") === "true",
  dailyCap: () => Math.max(1, Number(env("FIELD_DAILY_SEND_CAP")) || 20),
  signer: (): Signer => ({ name: env("FIELD_SENDER_NAME") || "Thomas", company: env("FIELD_SENDER_COMPANY") || "Gates Technologies" }),
};

/** YYYY-MM-DD for "today" in the console's timezone (Atlanta by default). */
export function todayIn(tz = fieldEnv.timezone(), at = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** Start of today in the console's timezone, as an ISO instant (for "sent today" counts). */
export function startOfTodayIso(tz = fieldEnv.timezone()): string {
  const now = new Date();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", hour: "numeric", minute: "numeric", second: "numeric" })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  const elapsed = (Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second)) * 1000;
  return new Date(now.getTime() - elapsed - now.getMilliseconds()).toISOString();
}

/**
 * Who is operating. From the signed session cookie. With the gate fully off
 * (local dev only), FIELD_DEV_OPERATOR can stand in — never in production.
 */
export async function currentOperator(): Promise<Operator | null> {
  if (!gateEnabled()) {
    const dev = env("FIELD_DEV_OPERATOR") as Operator;
    return process.env.NODE_ENV !== "production" && (dev === "thomas" || dev === "ace") ? dev : null;
  }
  const session = await readSession((await cookies()).get(GATE_COOKIE)?.value);
  return session?.operator ?? null;
}
