/**
 * What's new: a short, append-only log of shipped features for Thomas (/roadmap tab).
 * Any roster agent may add a row; nobody edits or deletes. Logging never touches the roadmap.
 */
import { appendFile } from "node:fs/promises";
import { getSetting, setSetting } from "@/lib/settings";
import { recordActivity } from "@/lib/activity";

export interface WhatsNew { date: string; title: string; note: string; by: string }

const SEED: WhatsNew[] = [
  { date: "2026-10-03", title: "What's new", note: "This tab.", by: "brain" },
  { date: "2026-10-02", title: "Money roadmap", note: "Nine steps from offer locked to first paid client, with live counts.", by: "brain" },
  { date: "2026-10-02", title: "Copy rules", note: "Core emails must quote published hours or the lead is held. Website emails are three plain fixes with no links.", by: "brain" },
];
const KEY = "whats_new";
const PRICE = /\$\s?\d|\b\d[\d,.]*\s?(?:k\s)?(?:dollars?|bucks|usd)\b|\b(?:price[ds]?|pricing|per month|a month|\/mo)\b/i;

export class WhatsNewError extends Error { constructor(public status: number, msg: string) { super(msg); } }

async function added(): Promise<WhatsNew[]> {
  try { return JSON.parse((await getSetting(KEY)) ?? "[]") as WhatsNew[]; } catch { return []; }
}

export async function listWhatsNew(): Promise<WhatsNew[]> {
  return [...(await added()).slice().reverse(), ...SEED];
}

export async function addWhatsNew(agent: string, title: string, note: string): Promise<WhatsNew[]> {
  const t = title.trim(), n = note.trim();
  if (!t || t.length >= 60) throw new WhatsNewError(422, "Title must be under 60 characters.");
  if (!n || n.length >= 200) throw new WhatsNewError(422, "Note must be one sentence under 200 characters.");
  if ((n.match(/[.!?](?:\s|$)/g) ?? []).length > 1) throw new WhatsNewError(422, "Note must be one sentence.");
  if (/[—–]/.test(t + n) || /\s-\s/.test(t + n)) throw new WhatsNewError(422, "No dashes as punctuation.");
  if (PRICE.test(t + " " + n)) throw new WhatsNewError(422, "No prices on What's new.");
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const row = { date, title: t, note: n, by: agent };
  await setSetting(KEY, JSON.stringify([...(await added()), row].slice(-300)));
  await recordActivity({ kind: "updated", target: `What's new: ${t}`, because: n, agent });
  // Local only: the deployed filesystem is read-only, so production rows live in the Brain.
  await appendFile("CHANGELOG.md", `- ${date} · ${agent} · What's new: ${t}. ${n}\n`).catch(() => {});
  return listWhatsNew();
}
