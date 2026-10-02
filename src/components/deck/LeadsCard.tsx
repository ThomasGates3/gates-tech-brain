"use client";

import { useCallback, useEffect, useState } from "react";
import { callTool } from "@/lib/ux/tools";

/** Dashboard card: today's leads at a glance + the moves that matter. Full list on /leads. */
interface Lead { contact_id: string; business: string; lane: string; tier: string; email1_status: string; next_action: string }
interface Data { date: string; counts: Record<string, number>; leads: Lead[] }

// Most urgent first: Thomas's approvals, then sends, Nick, drafts.
const RANK: Record<string, number> = { PASS: 0, approved: 1, atNick: 2, drafted: 3, undrafted: 4 };
const btn = "min-h-[36px] rounded-md px-3 text-[12px] font-medium transition-colors disabled:opacity-40";

export function LeadsCard({ fill = false, topCount = 3 }: { fill?: boolean; topCount?: number }) {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);

  const load = useCallback(async () => {
    try { const r = await fetch("/api/leads"); if (r.ok) setData(await r.json()); } catch { /* keep last */ }
  }, []);
  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 30000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [load]);

  const undrafted = (data?.leads ?? []).filter((l) => l.email1_status === "undrafted" && l.tier !== "Soft");
  const top = (data?.leads ?? []).filter((l) => l.email1_status in RANK).sort((a, b) => RANK[a.email1_status] - RANK[b.email1_status]).slice(0, topCount);
  const c = data?.counts ?? {};

  const act = async (label: string, fn: () => Promise<string>) => {
    setBusy(label); setMsg(null);
    try { setMsg(await fn()); await load(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); setArmed(false); }
  };
  const loadPack = () => act("load", async () => {
    const r = await callTool<{ loaded: { added: number; updated: number } }>("brain_field_queue", { agent: "ace", load_from_notion: true });
    return `Notion pack loaded: ${r.loaded.added} new, ${r.loaded.updated} updated.`;
  });
  const draftAll = () => act("draft", async () => {
    const r = await callTool<{ succeeded: number; failed: number }>("brain_batch_set_draft", { agent: "darrell", items: undrafted.slice(0, 50).map((l) => ({ contact_id: l.contact_id, generate: "template" })) });
    return `Template drafts: ${r.succeeded} written${r.failed ? `, ${r.failed} failed` : ""}. Nick audits next.`;
  });

  const mini: [string, string, string][] = [
    ["Core / web", `${c.core ?? "—"} / ${c.website ?? "—"}`, "/leads"],
    ["Undrafted", String(c.undrafted ?? "—"), "/leads?status=undrafted"],
    ["At Nick", String((c.awaitingNick ?? 0) + (c.drafted ?? 0)), "/leads?status=drafted"],
    ["PASS", String(c.passAwaitingApprove ?? "—"), "/leads?status=PASS"],
  ];

  return (
    <div data-testid="leads-card" className={`flex flex-col rounded-xl border border-[var(--accent-deep)]/30 bg-[var(--panel)]/70 p-4 backdrop-blur ${fill ? "min-h-0 flex-1" : ""}`}>
      <div className="mb-3 flex items-center justify-between">
        <a href="/leads" data-testid="leads-open" className="flex min-h-[44px] items-center gap-2 font-mono lg:min-h-0 text-[10px] uppercase tracking-[0.28em] text-[var(--accent-soft)] hover:text-[var(--accent)]">
          <span className="h-1 w-4 bg-[var(--accent)]" />Today&apos;s leads →
        </a>
        <span className="font-mono text-[10px] text-slate-500">{data ? `${c.total} · ${data.date}` : "…"}</span>
      </div>
      <div className="mb-3 grid grid-cols-4 gap-2">
        {mini.map(([label, value, href]) => (
          <a key={label} href={href} className="min-h-[44px] rounded-lg border border-white/[0.06] bg-black/30 px-2 py-2 hover:border-[var(--accent)]/40">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
            <p className="mt-0.5 font-mono text-base leading-none text-slate-100">{value}</p>
          </a>
        ))}
      </div>
      <ul className={`mb-3 space-y-1.5 ${fill ? "min-h-0 flex-1 overflow-y-auto pr-1" : ""}`} data-testid="leads-top">
        {top.map((l) => (
          <li key={l.contact_id} className="flex items-center gap-2">
            <a href={`/leads?status=${l.email1_status}`} className="flex min-h-[44px] min-w-0 flex-1 items-center justify-between gap-3 rounded px-1 py-0.5 hover:bg-white/[0.03] lg:min-h-0">
              <span className="truncate text-[13px] text-slate-200">{l.business}<span className="ml-1.5 font-mono text-[10px] text-slate-500">{l.lane}</span></span>
              <span className="shrink-0 text-[12px] text-[var(--accent-soft)]">{l.next_action}</span>
            </a>
            {l.email1_status === "PASS" && (
              <button
                data-testid={`card-approve-${l.contact_id}`}
                disabled={!!busy}
                title="Approve (does not send)"
                onClick={() => act(`approve-${l.contact_id}`, async () => { await callTool("brain_approve", { contact_id: l.contact_id }); return `Approved ${l.business}. It waits for warm-up before it can send.`; })}
                className="min-h-[44px] shrink-0 rounded-md bg-[var(--accent)] px-3 text-[12px] font-medium text-black hover:bg-[var(--accent-bright)] disabled:opacity-40 lg:min-h-[28px] lg:px-2 lg:text-[11px]"
              >
                {busy === `approve-${l.contact_id}` ? "…" : "Approve"}
              </button>
            )}
          </li>
        ))}
        {data && !top.length && <li className="text-[12px] text-slate-500">Nothing waiting. Load the morning pack to start.</li>}
      </ul>
      <div className="flex flex-wrap gap-2">
        <a href="/leads" className={`${btn} grid place-items-center bg-[var(--accent)] text-black hover:bg-[var(--accent-bright)]`}>Open leads</a>
        <button onClick={loadPack} disabled={!!busy} data-testid="leads-load" className={`${btn} border border-white/10 text-slate-200 hover:border-[var(--accent)]/50`}>{busy === "load" ? "Loading…" : "Load Notion pack"}</button>
        {undrafted.length > 0 && (
          <button onClick={() => (armed ? draftAll() : setArmed(true))} disabled={!!busy} data-testid="leads-draft-all" className={`${btn} border ${armed ? "border-amber-400/60 text-amber-200" : "border-white/10 text-slate-200"} hover:border-[var(--accent)]/50`}>
            {busy === "draft" ? "Drafting…" : armed ? `Confirm: template-draft ${Math.min(undrafted.length, 50)}` : `Template-draft ${undrafted.length} undrafted`}
          </button>
        )}
      </div>
      {msg && <p className="mt-2 text-[12px] text-slate-300" data-testid="leads-msg">{msg}</p>}
    </div>
  );
}
