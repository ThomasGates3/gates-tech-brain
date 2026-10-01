/**
 * Notion "Cold emails (paste)" data source — morning pack source + write-back.
 *
 * Schema (as of 2026-09-30): Name (title) · To (email) · Priority (High/Med/Soft)
 * · Status (Ready/Sent/Hold/Kill) · Date · City · Gap · Batch · Subject · Body.
 * Uses the data-sources API (Notion-Version 2025-09-03). Server-only.
 */
import { fieldEnv } from "./config";
import type { Priority } from "./types";

const NOTION_VERSION = "2025-09-03";
const BASE = "https://api.notion.com/v1";

export interface NotionRow {
  pageId: string;
  name: string;
  email: string;
  city: string;
  batch: string;
  gap: string;
  priority: Priority | null;
  status: string | null; // Ready | Sent | Hold | Kill
  date: string | null;
  subject: string;
  body: string;
}

export type NotionStatus = "Ready" | "Sent" | "Hold" | "Kill";

async function notion(path: string, init: { method: string; body?: unknown }): Promise<Record<string, unknown>> {
  const token = fieldEnv.notionToken();
  if (!token) throw new Error("NOTION_TOKEN is not set.");
  const res = await fetch(`${BASE}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`Notion ${res.status}: ${String(data.message ?? res.statusText)}`);
  return data;
}

type Prop = Record<string, unknown> & { type?: string };

function plain(rich: unknown): string {
  return Array.isArray(rich) ? rich.map((r) => String((r as { plain_text?: string }).plain_text ?? "")).join("") : "";
}

function read(props: Record<string, Prop>, key: string): string {
  const p = props[key];
  if (!p) return "";
  switch (p.type) {
    case "title":
      return plain(p.title);
    case "rich_text":
      return plain(p.rich_text);
    case "email":
      return String(p.email ?? "");
    case "select":
      return String((p.select as { name?: string } | null)?.name ?? "");
    case "status":
      return String((p.status as { name?: string } | null)?.name ?? "");
    case "date":
      return String((p.date as { start?: string } | null)?.start ?? "");
    default:
      return "";
  }
}

function toRow(page: { id: string; properties: Record<string, Prop> }): NotionRow {
  const p = page.properties;
  const pri = read(p, "Priority");
  return {
    pageId: page.id,
    name: read(p, "Name").trim(),
    email: read(p, "To").trim(),
    city: read(p, "City").trim(),
    batch: read(p, "Batch").trim(),
    gap: read(p, "Gap").trim(),
    priority: pri === "High" || pri === "Med" || pri === "Soft" ? pri : null,
    status: read(p, "Status") || null,
    date: read(p, "Date").slice(0, 10) || null,
    subject: read(p, "Subject").trim(),
    body: read(p, "Body").trim(),
  };
}

/** All rows dated `date` (the morning pack). Soft rows included — the console holds them. */
export async function fetchPack(date: string): Promise<NotionRow[]> {
  const ds = fieldEnv.notionDataSource();
  if (!ds) throw new Error("NOTION_COLD_EMAILS_DATA_SOURCE_ID is not set.");
  const rows: NotionRow[] = [];
  let cursor: string | undefined;
  do {
    const data = await notion(`/data_sources/${ds}/query`, {
      method: "POST",
      body: {
        filter: { property: "Date", date: { equals: date } },
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      },
    });
    for (const r of (data.results as { id: string; properties: Record<string, Prop> }[]) ?? []) rows.push(toRow(r));
    cursor = data.has_more ? String(data.next_cursor) : undefined;
  } while (cursor);
  return rows;
}

/** Notion rich_text caps each text object at 2000 chars. */
function richText(s: string) {
  const chunks = s.match(/[\s\S]{1,2000}/g) ?? [];
  return chunks.map((content) => ({ type: "text", text: { content } }));
}

export async function writeBack(pageId: string, update: { status?: NotionStatus; subject?: string; body?: string }): Promise<void> {
  const properties: Record<string, unknown> = {};
  if (update.status) properties.Status = { select: { name: update.status } };
  if (update.subject !== undefined) properties.Subject = { rich_text: richText(update.subject) };
  if (update.body !== undefined) properties.Body = { rich_text: richText(update.body) };
  if (!Object.keys(properties).length) return;
  await notion(`/pages/${pageId}`, { method: "PATCH", body: { properties } });
}
