/**
 * STUB. Notion sync for Mission Control. This file makes NO network call and sends nothing
 * to Notion, even when the flag is on. It only ever goes Brain to Notion, never back.
 *
 * The flag is the settings key `mission_notion_sync` (unset counts as off).
 * Replace the body of `pushTask` with a real Notion write when sync is approved.
 */
import { COLUMN_LABEL, LANE_LABEL, PRIORITY_LABEL, type Task } from "./model";

export const NOTION_SYNC_KEY = "mission_notion_sync";
export const isSyncOn = (value: string | undefined) => value === "on";

/** Pure: maps a task to Notion property shapes. */
export function notionProps(t: Task): Record<string, unknown> {
  return {
    Name: { title: [{ text: { content: t.title } }] },
    Status: { select: { name: COLUMN_LABEL[t.column] } },
    Lane: { select: { name: LANE_LABEL[t.lane] } },
    Priority: { select: { name: PRIORITY_LABEL[t.priority] } },
    Assignee: { rich_text: [{ text: { content: t.agent ?? "" } }] },
    Due: t.dueDate ? { date: { start: t.dueDate } } : { date: null },
    Recurring: { checkbox: t.recurring },
    Ask: { rich_text: [{ text: { content: t.ask ?? "" } }] },
    "Brain ID": { rich_text: [{ text: { content: t.id } }] },
  };
}

export async function pushTask(
  t: Task, enabled: boolean, log?: (line: string) => Promise<void> | void,
): Promise<{ skipped: true } | { stub: true }> {
  if (!enabled) return { skipped: true };
  notionProps(t); // build the payload so shape errors surface, then drop it
  await log?.("Notion sync is a stub: nothing sent");
  return { stub: true };
}
