/**
 * CSV fallback for the morning pack. Same columns as the Notion DB export:
 * Name, To (or Email), Priority, City, Gap, Batch, Date, Subject, Body, Status.
 * RFC 4180-ish: quoted fields, escaped quotes, newlines inside quotes.
 */
import type { NotionRow } from "./notion";

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const ALIASES: Record<string, keyof Omit<NotionRow, "pageId">> = {
  name: "name",
  business: "name",
  to: "email",
  email: "email",
  priority: "priority",
  tier: "priority",
  city: "city",
  gap: "gap",
  batch: "batch",
  niche: "batch",
  date: "date",
  subject: "subject",
  body: "body",
  status: "status",
};

/** Rows as NotionRow-shaped records (pageId empty). Throws on missing Name/To columns. */
export function csvToRows(text: string): Omit<NotionRow, "pageId">[] {
  const [header, ...data] = parseCsv(text);
  if (!header) throw new Error("CSV is empty.");
  const cols = header.map((h) => ALIASES[h.trim().toLowerCase()]);
  if (!cols.includes("name") || !cols.includes("email")) throw new Error("CSV needs at least Name and To (or Email) columns.");
  return data.map((cells) => {
    const r: Record<string, string> = {};
    cols.forEach((key, i) => {
      if (key) r[key] = (cells[i] ?? "").trim();
    });
    const pri = (r.priority ?? "").toLowerCase();
    return {
      name: r.name ?? "",
      email: r.email ?? "",
      city: r.city ?? "",
      batch: r.batch ?? "",
      gap: r.gap ?? "",
      priority: pri === "high" ? "High" : pri === "med" || pri === "medium" ? "Med" : pri === "soft" ? "Soft" : null,
      status: r.status || null,
      date: (r.date ?? "").slice(0, 10) || null,
      subject: r.subject ?? "",
      body: r.body ?? "",
    };
  });
}
