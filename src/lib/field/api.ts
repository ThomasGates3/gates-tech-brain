/**
 * Shared helpers for /api/field/* route handlers. Server-only.
 */
import { currentOperator, fieldEnv, startOfTodayIso, todayIn } from "./config";
import { canGreenlight } from "./workflow";
import { sentSince } from "./store";
import { writeBack, type NotionStatus } from "./notion";
import { canSpamFooter } from "./playbook";
import type { ConsoleConfig, FieldContact, Operator } from "./types";

export const json = (data: unknown, status = 200) => Response.json(data, { status });
export const error = (status: number, message: string) => json({ ok: false, error: message }, status);

/** Field Console is Thomas + Ace only. Returns the operator or a ready-made error Response. */
export async function requireOperator(): Promise<{ operator: Operator } | { response: Response }> {
  const operator = await currentOperator();
  if (operator !== "thomas" && operator !== "ace") {
    return { response: error(403, "Field Console is for Thomas and Ace. Sign in with your Field Console password.") };
  }
  if (!fieldEnv.database()) return { response: error(503, "DATABASE_URL is not set — the console needs Neon for the send log and suppression list.") };
  return { operator };
}

export async function consoleConfig(operator: Operator | null): Promise<ConsoleConfig> {
  const db = fieldEnv.database();
  return {
    operator,
    canGreenlight: canGreenlight(operator, fieldEnv.aceCanSend()),
    today: todayIn(),
    timezone: fieldEnv.timezone(),
    database: db,
    notion: Boolean(fieldEnv.notionToken() && fieldEnv.notionDataSource()),
    agentmail: Boolean(fieldEnv.agentmailKey() && fieldEnv.agentmailInbox()),
    inbox: fieldEnv.agentmailInbox() || null,
    claude: fieldEnv.claude(),
    mailingAddress: fieldEnv.mailingAddress() || null,
    footer: fieldEnv.mailingAddress() ? canSpamFooter(fieldEnv.signer().company, fieldEnv.mailingAddress()) : null,
    domainWarmed: fieldEnv.domainWarmed(),
    dailyCap: fieldEnv.dailyCap(),
    sentToday: db ? await sentSince(startOfTodayIso()).catch(() => 0) : 0,
  };
}

export type SyncResult = "ok" | "skipped" | { error: string };

/** Best-effort status/draft write-back to the Notion row. Never undoes the console action. */
export async function syncNotion(c: FieldContact, update: { status?: NotionStatus; subject?: string; body?: string }): Promise<SyncResult> {
  if (c.source !== "notion" || !c.notionPageId || !fieldEnv.notionToken()) return "skipped";
  try {
    await writeBack(c.notionPageId, update);
    return "ok";
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
