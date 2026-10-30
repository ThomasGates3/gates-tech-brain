"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import GlassFolder, { type ArtRecipe, type FolderFile } from "@/components/ui/glass-folder-cards";
import { callTool } from "@/lib/ux/tools";

/** Control Center scoreboard: the Field numbers that decide Thomas's next move. */
export interface ScoreboardData {
  sent: { value: number; cap: number };
  passAwaitingApprove: number;
  approvedUnsent: number;
  core: number;
  website: number;
  inboundUnanswered: number | null;
  sequenceDue: number;
  domainWarmed: boolean;
  warmNote: string;
}

interface Lead { contact_id: string; business: string; lane: string; tier: string; email1_status: string; next_action: string }
interface LeadsData { date: string; leads: Lead[] }

type FolderId = "new" | "approved" | "sent" | "followup";
const blue = (colors: string[], angle: number): ArtRecipe => ({ style: "marble", colors, scale: 0.7, warp: 3.2, angle, gloss: 0.5, veins: 0.35 });
// A ladder of blues, light to deep, with Follow Up the brightest (silvery ice) so it stands out.
const FOLDERS: { id: FolderId; label: string; art: ArtRecipe; glow: string; href: string }[] = [
  { id: "new", label: "New Leads", glow: "rgba(0,229,255,.9)", href: "/leads", art: blue(["#031a2e", "#055a8c", "#18a8e0", "#0a3d66", "#5fd4ff", "#b8ecff", "#e6f9ff"], -0.5) },
  { id: "approved", label: "Approved", glow: "rgba(70,140,255,.9)", href: "/leads?status=approved", art: blue(["#020c24", "#0a2f78", "#2a6bd6", "#071a4a", "#4f95ff", "#a9c9ff", "#e3eeff"], 0.8) },
  { id: "sent", label: "Sent", glow: "rgba(90,110,255,.8)", href: "/leads?status=sent", art: blue(["#01040f", "#06113a", "#13286e", "#050b26", "#2a4297", "#6f86d6", "#c4cff5"], 2.1) },
  { id: "followup", label: "Follow Up", glow: "rgba(255,255,255,.95)", href: "/leads?status=sent", art: { style: "streak", colors: ["#f7f9fc", "#dfe7f2", "#a9b9d0", "#eef2f8", "#c6d2e4", "#ffffff"], scale: 0.7, warp: 1.6, angle: 0.35, gloss: 0.3, veins: 0 } },
];
const NEW_STATUSES = ["undrafted", "drafted", "atNick", "PASS"];
const STATUS_LABEL: Record<string, string> = { undrafted: "Needs draft", drafted: "Drafted", atNick: "At Nick", PASS: "Needs approval", approved: "Ready to send", sent: "Sent" };

/** Sort today's leads into the four folders. Held and killed leads stay out. */
function sortLeads(data: LeadsData | null): Record<FolderId, FolderFile[]> {
  const out: Record<FolderId, FolderFile[]> = { new: [], approved: [], sent: [], followup: [] };
  for (const l of data?.leads ?? []) {
    const href = `/leads?open=${encodeURIComponent(l.contact_id)}`;
    const file = (meta: string): FolderFile => ({ name: l.business, meta, href });
    if (NEW_STATUSES.includes(l.email1_status)) out.new.push(file(STATUS_LABEL[l.email1_status]));
    else if (l.email1_status === "approved") out.approved.push(file(STATUS_LABEL.approved));
    else if (l.email1_status === "sent") {
      const due = l.next_action.match(/^Follow-up due Email (\d) (\d{4}-\d{2}-\d{2})/);
      if (due && data && due[2] <= data.date) out.followup.push(file(`Email ${due[1]} due`));
      else out.sent.push(file(l.next_action.startsWith("Replied") ? "Replied" : "Sent"));
    }
  }
  return out;
}

/** Container width, so the 2×2 folder grid fills whatever column it is in. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function Scoreboard({ data, onChange }: { data: ScoreboardData | null; onChange?: () => void }) {
  const d = data;
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const confirmWarm = async () => {
    if (!armed) return setArmed(true);
    setBusy(true); setErr(null);
    try { await callTool("brain_set_gate", { domain_warmed: true }); onChange?.(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); setArmed(false); }
  };
  const [leads, setLeads] = useState<LeadsData | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => fetch("/api/leads").then((r) => (r.ok ? r.json() : null)).then((j) => alive && j?.leads && setLeads(j)).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, [onChange]);
  const sorted = sortLeads(leads);
  const [gridRef, gridW] = useWidth();
  const gap = 20;
  const folderW = gridW ? Math.min(280, Math.max(130, Math.floor((gridW - gap) / 2))) : 0;
  return (
    <div data-testid="scoreboard" className="rounded-xl border border-[var(--accent-deep)]/30 bg-[var(--panel)]/70 p-4 backdrop-blur">
      <div className="mb-10 flex items-center justify-between gap-2">
        <a href="/leads" className="flex min-h-[44px] items-center gap-2 font-mono lg:min-h-0 text-[10px] uppercase tracking-[0.28em] text-[var(--accent-soft)] hover:text-[var(--accent)]">
          <span className="h-1 w-4 bg-[var(--accent)]" />Today&apos;s lead folders →
        </a>
        <span data-testid="sb-sent" className={`font-mono text-[10px] ${d && d.sent.value >= d.sent.cap ? "text-[var(--accent)]" : "text-slate-500"}`}>sent {d ? `${d.sent.value}/${d.sent.cap}` : "—"}</span>
      </div>
      <div ref={gridRef} data-testid="lead-folders" className="grid grid-cols-2 justify-items-center gap-x-5 gap-y-3">
        {folderW > 0 && FOLDERS.map((f, i) => {
          const files = sorted[f.id];
          const ids = files.map((x) => x.href).join("|");
          return (
            <div key={f.id} data-testid={`folder-${f.id}`} className="relative hover:z-20 focus-within:z-20">
              <GlassFolder
                key={`${f.id}:${folderW}:${ids}`}
                label={f.label}
                tone="dark"
                art={f.art}
                style={{ "--gf-glow": f.glow, "--gf-badge-ink": f.id === "followup" ? "#04121f" : "#fff" } as CSSProperties}
                seed={i * 5 + 3}
                files={files}
                action="more"
                labelPlacement="center"
                meta=""
                badge={files.length}
                width={folderW}
                appearDelay={i * 120}
                menu={[{ label: "View all in Leads", onSelect: () => { window.location.href = f.href; } }]}
              />
            </div>
          );
        })}
      </div>
      {d && (
        <div data-testid="sb-warm" className={`mt-2 rounded-md px-2.5 py-1.5 text-[11px] ${d.domainWarmed ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-200"}`}>
          <p>{d.warmNote}</p>
          {!d.domainWarmed && <p className="mt-1 text-amber-100/80">Confirm warm-up = allow Field sends. Does not send mail by itself.</p>}
          {!d.domainWarmed && (
            <button onClick={confirmWarm} disabled={busy} data-testid="sb-warm-confirm" title="Thomas only. Opens sending for approved emails." className={`mt-1.5 min-h-[32px] rounded-md border px-2.5 text-[11px] font-medium ${armed ? "border-amber-300 bg-amber-300/20 text-amber-100" : "border-amber-400/40 text-amber-200 hover:bg-amber-400/10"} disabled:opacity-50`}>
              {busy ? "Saving…" : armed ? "Click again to confirm warm-up" : "Confirm warm-up"}
            </button>
          )}
          {err && <p className="mt-1 text-red-300">{err}</p>}
        </div>
      )}
    </div>
  );
}
