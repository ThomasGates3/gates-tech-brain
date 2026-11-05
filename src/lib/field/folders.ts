/**
 * The four lead folders (New Leads, Approved, Sent, Follow Up) — one sort shared by the dashboard
 * and the /leads page. Held and killed leads sit outside the folders (the "Held" view on /leads).
 * Client-safe: types only.
 */
import type { Lead } from "./leads";

export type FolderId = "new" | "approved" | "sent" | "followup";

export const FOLDER_LABEL: Record<FolderId, string> = { new: "New Leads", approved: "Approved", sent: "Sent", followup: "Follow Up" };
export const NEW_STATUSES = ["undrafted", "drafted", "atNick", "PASS"];
export const STATUS_LABEL: Record<string, string> = { undrafted: "Needs draft", drafted: "Drafted", atNick: "At Nick", PASS: "Needs approval", approved: "Ready to send", sent: "Sent" };

export interface FolderItem { lead: Lead; meta: string; href: string }
export type Sorted = Record<FolderId, FolderItem[]>;

export const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
export const daysBefore = (date: string, n: number) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

/**
 * Sort the rolling board (/api/leads?scope=open) into the folders. Unfinished leads from earlier packs stay put,
 * tagged with their pack day, until they move on. `sentDays` is how far back the Sent folder looks.
 */
export function sortIntoFolders(leads: Lead[], today: string, sentDays = 7): Sorted {
  const out: Sorted = { new: [], approved: [], sent: [], followup: [] };
  // Before /api/leads answers, `today` is "" — new Date("T12:00:00Z") is invalid and toISOString() throws,
  // which took down the whole dashboard. No date yet means nothing to sort yet.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return out;
  const since = daysBefore(today, sentDays);
  for (const l of leads) {
    const href = `/leads?open=${encodeURIComponent(l.contact_id)}`;
    const from = l.pack_date < today ? ` · ${shortDate(l.pack_date)}` : "";
    const put = (id: FolderId, meta: string) => out[id].push({ lead: l, meta, href });
    if (NEW_STATUSES.includes(l.email1_status)) put("new", STATUS_LABEL[l.email1_status] + from);
    else if (l.email1_status === "approved") put("approved", STATUS_LABEL.approved + from);
    else if (l.email1_status === "sent") {
      const due = l.next_action.match(/^Follow-up due Email (\d) (\d{4}-\d{2}-\d{2})/);
      if (due && due[2] <= today) put("followup", `Email ${due[1]} due`);
      else if (l.replied || (l.sent_at ?? "").slice(0, 10) >= since) put("sent", l.replied ? "Replied" : "Sent");
    }
  }
  return out;
}
