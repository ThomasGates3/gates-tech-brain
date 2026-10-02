"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Fragment } from "react";
import { LeadActions } from "./LeadActions";
import { DraftPreview } from "./DraftPreview";
import { callTool } from "@/lib/ux/tools";

/** Control Center "Today's leads": every lead for a date with lane, state and next action (reads the Brain DB). */
interface Lead {
  contact_id: string; business: string; contact_name: string | null; email: string; lane: "core" | "website"; source: string; tier: "High" | "Med" | "Soft";
  email1_status: string; nick_verdict: string | null; nick_note: string | null; approved: boolean; sent_at: string | null; subject: string | null;
  lint_issues: number; suppressed: boolean; replied: boolean; duplicate_of: string[]; hold_reason: string | null; revise_pending: boolean;
  duplicates: { contact_id: string; source: string; tier: string; email1_status: string }[]; next_action: string;
}
interface Counts { core: number; website: number; drafted: number; awaitingNick: number; passAwaitingApprove: number; approvedUnsent: number; softHold: number; total: number; duplicates: number }
interface Data { date: string; counts: Counts; sentToday: number; gates: { domainWarmed: boolean; warmNote: string; dailyCap: number }; leads: Lead[] }

const STATUSES = ["undrafted", "drafted", "atNick", "PASS", "approved", "sent", "hold", "kill"];
const STATUS_STYLE: Record<string, string> = {
  undrafted: "bg-white/5 text-slate-400", drafted: "bg-sky-400/10 text-sky-300", atNick: "bg-violet-400/10 text-violet-300",
  PASS: "bg-[var(--accent)]/15 text-[var(--accent)]", approved: "bg-emerald-400/15 text-emerald-300", sent: "bg-emerald-400/5 text-emerald-200/70",
  hold: "bg-amber-400/10 text-amber-200", kill: "bg-red-500/10 text-red-300",
};
const HOLD_LABEL: Record<string, string> = { soft: "soft", no_published_hours: "needs hours", thomas: "Thomas", other: "other" };
const ACTION_HOT = /Approve|Nick audit|draft|Fix copy|send|Duplicate/i;
const sel = "min-h-[36px] rounded-md border border-white/10 bg-black/40 px-2 text-[12px] text-slate-200 outline-none focus:border-[var(--accent)]/60";

function Badge({ children, className, testId }: { children: React.ReactNode; className: string; testId?: string }) {
  return <span data-testid={testId} className={`inline-block rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${className}`}>{children}</span>;
}

/** Render only the table (md+) or only the cards (phone), never both. */
const MD = "(min-width: 768px)";
const useWide = () =>
  useSyncExternalStore(
    (cb) => { const m = window.matchMedia(MD); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
    () => window.matchMedia(MD).matches,
    () => true
  );

export type LeadFilters = { date?: string; lane?: string; status?: string; tier?: string; open?: string };

export function LeadsBoard({ initial = {} }: { initial?: LeadFilters }) {
  const [date, setDate] = useState(initial.date ?? "");
  const [lane, setLane] = useState(initial.lane ?? "");
  const [status, setStatus] = useState(initial.status ?? "");
  const [tier, setTier] = useState(initial.tier ?? "");
  const [openId, setOpenId] = useState<string | null>(initial.open ?? null);
  const wide = useWide();
  const [version, setVersion] = useState(0); // bump to refresh an open preview after an action
  const toggle = (id: string) => setOpenId((o) => (o === id ? null : id));
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const q = new URLSearchParams(Object.entries({ date, lane, status, tier }).filter(([, v]) => v));
    try {
      const r = await fetch(`/api/leads?${q}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed to load leads");
      setData(d);
      setErr(null);
      setVersion((v) => v + 1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [date, lane, status, tier]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 30000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [load]);

  const c = data?.counts;
  const warmed = Boolean(data?.gates.domainWarmed);
  const nickReady = (data?.leads ?? []).filter((l) => l.email1_status === "drafted" && l.lint_issues === 0 && !l.revise_pending).length;
  const [nickBusy, setNickBusy] = useState(false);
  const [nickMsg, setNickMsg] = useState<string | null>(null);
  const sendToNick = async () => {
    setNickBusy(true); setNickMsg(null);
    try {
      const r = await callTool<{ submitted: number; count: number; needs_fix: unknown[] }>("brain_nick_queue", { agent: "ace", submit: true, ...(lane && { lane }), ...(date && { date }) });
      setNickMsg(`${r.submitted} sent to Nick (${r.count} in his pack)${r.needs_fix.length ? `; ${r.needs_fix.length} need copy fixes first` : ""}.`);
      await load();
    } catch (e) { setNickMsg(e instanceof Error ? e.message : String(e)); } finally { setNickBusy(false); }
  };
  const strip: [string, string, boolean?][] = c
    ? [
        ["Core / website", `${c.core} / ${c.website}`],
        ["Drafted", String(c.drafted)],
        ["Awaiting Nick", String(c.awaitingNick), c.awaitingNick > 0],
        ["PASS → Approve", String(c.passAwaitingApprove), c.passAwaitingApprove > 0],
        ["Approved unsent", String(c.approvedUnsent), c.approvedUnsent > 0],
        ["Sent today", `${data!.sentToday}/${data!.gates.dailyCap}`],
        ["Soft hold", String(c.softHold)],
        ...(c.duplicates ? [["Duplicates", String(c.duplicates), true] as [string, string, boolean]] : []),
      ]
    : [];

  return (
    <section data-testid="leads-board" className="rounded-xl border border-[var(--accent-deep)]/30 bg-[var(--panel)]/70 p-4 backdrop-blur">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="h-1 w-4 bg-[var(--accent)]" />
        <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--accent-soft)]">Today&apos;s leads</span>
        <span className="font-mono text-[10px] text-slate-500">{data ? `${data.leads.length} of ${c?.total} · ${data.date}` : "…"}</span>
        {data && (
          <span data-testid="board-warm" className={`ml-auto rounded px-2 py-0.5 text-[11px] ${data.gates.domainWarmed ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-200"}`}>
            {data.gates.domainWarmed ? "Domain warmed: sends open" : "Warm-up not confirmed: no sends"}
          </span>
        )}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <input type="date" value={date || data?.date || ""} onChange={(e) => setDate(e.target.value)} data-testid="board-date" aria-label="Date" className={sel} />
        <select value={lane} onChange={(e) => setLane(e.target.value)} data-testid="board-lane" aria-label="Lane" className={sel}>
          <option value="">All lanes</option><option value="core">Core</option><option value="website">Website</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} data-testid="board-status" aria-label="Status" className={sel}>
          <option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={tier} onChange={(e) => setTier(e.target.value)} data-testid="board-tier" aria-label="Tier" className={sel}>
          <option value="">All tiers</option><option>High</option><option>Med</option><option>Soft</option>
        </select>
        <button onClick={sendToNick} disabled={nickBusy || !nickReady} data-testid="board-send-nick" title="Moves every clean draft to Nick's queue (brain_nick_queue)" className="min-h-[36px] rounded-md bg-[var(--accent)] px-3 text-[12px] font-medium text-black hover:bg-[var(--accent-bright)] disabled:opacity-40">
          {nickBusy ? "Sending…" : `Send ${nickReady} drafted to Nick`}
        </button>
        {nickMsg && <span className="self-center text-[12px] text-slate-300" data-testid="board-nick-msg">{nickMsg}</span>}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8" data-testid="board-counts">
        {strip.map(([label, value, hot]) => (
          <div key={label} className={`rounded-lg border px-2.5 py-2 ${hot ? "border-[var(--accent)]/50 bg-[var(--accent)]/10" : "border-white/[0.06] bg-black/30"}`}>
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <p className={`mt-0.5 font-mono text-lg leading-none ${hot ? "text-[var(--accent)]" : "text-slate-100"}`}>{value}</p>
          </div>
        ))}
      </div>

      {err && <p className="rounded-md bg-red-500/10 px-3 py-2 text-[12px] text-red-300">{err}</p>}
      {data && !data.leads.length && <p className="rounded-md bg-black/30 px-3 py-6 text-center text-[13px] text-slate-500">No leads for this filter. Ace loads the morning pack, Ashley and Prospectacle upsert leads.</p>}

      {/* Desktop table */}
      {data && data.leads.length > 0 && wide && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">
              <tr>{["Lead", "Lane", "Source", "Tier", "Email 1", "Nick", "Subject", "Next action", "Actions"].map((h) => <th key={h} className="px-2 py-1.5 font-normal">{h}</th>)}</tr>
            </thead>
            <tbody>
              {data.leads.map((l) => (
                <Fragment key={l.contact_id}>
                <tr data-testid={`lead-${l.contact_id}`} data-status={l.email1_status} className={`border-t border-white/[0.05] align-top hover:bg-white/[0.02] ${openId === l.contact_id ? "bg-white/[0.03]" : ""}`}>
                  <td className="px-2 py-2">
                    <button onClick={() => toggle(l.contact_id)} data-testid={`open-${l.contact_id}`} className="text-left text-slate-100 hover:text-[var(--accent-soft)]">
                      <span className="mr-1 font-mono text-[10px] text-slate-500">{openId === l.contact_id ? "▾" : "▸"}</span>{l.business}
                    </button>
                    {l.duplicate_of.length > 0 && <Badge testId="lead-dup" className="ml-1.5 bg-amber-400/15 text-amber-200">dup</Badge>}
                    <p className="text-[11px] text-slate-500">{[l.contact_name, l.email].filter(Boolean).join(" · ")}</p>
                    {l.duplicates.length > 0 && <p className="text-[10px] text-amber-200/80">also: {l.duplicates.map((d) => `${d.source} ${d.tier} ${d.email1_status}`).join(", ")}</p>}
                  </td>
                  <td className="px-2 py-2"><Badge testId="lead-lane" className={l.lane === "website" ? "bg-[var(--accent)]/15 text-[var(--accent-soft)]" : "bg-white/5 text-slate-300"}>{l.lane}</Badge></td>
                  <td className="px-2 py-2 font-mono text-[11px] text-slate-400">{l.source}</td>
                  <td className="px-2 py-2 font-mono text-[11px] text-slate-300">{l.tier}</td>
                  <td className="px-2 py-2">
                    <Badge testId="lead-status" className={STATUS_STYLE[l.email1_status] ?? ""}>{l.email1_status}</Badge>
                    {l.hold_reason && <Badge testId="lead-hold-reason" className="ml-1 bg-amber-400/10 text-amber-200/90">{HOLD_LABEL[l.hold_reason] ?? l.hold_reason}</Badge>}
                    {l.lint_issues > 0 && <span className="ml-1 font-mono text-[10px] text-red-300">lint {l.lint_issues}</span>}
                  </td>
                  <td className="max-w-[180px] px-2 py-2 text-[11px] text-slate-400" title={l.nick_note ?? undefined}>{l.nick_verdict ? <><span className="text-slate-200">{l.nick_verdict}</span>{l.nick_note ? ` · ${l.nick_note.slice(0, 60)}` : ""}</> : "—"}</td>
                  <td className="max-w-[220px] px-2 py-2 text-[11px]">
                    {l.subject ? <button onClick={() => toggle(l.contact_id)} className="max-w-full truncate text-left text-slate-300 underline decoration-white/20 underline-offset-2 hover:text-[var(--accent-soft)]" title="Read the email">{l.subject}</button> : <span className="text-slate-500">—</span>}
                  </td>
                  <td className={`max-w-[200px] px-2 py-2 text-[12px] ${ACTION_HOT.test(l.next_action) ? "text-[var(--accent-soft)]" : "text-slate-400"}`} data-testid="lead-next">{l.next_action}</td>
                  <td className="px-2 py-2"><LeadActions lead={l} warmed={warmed} onDone={load} /></td>
                </tr>
                {l.nick_verdict === "REVISE" && l.nick_note && l.email1_status !== "sent" && (
                  <tr data-testid={`nick-note-${l.contact_id}`}><td colSpan={9} className="px-2 pb-2 pt-0">
                    <p className="rounded-md border border-amber-400/20 bg-amber-400/5 px-2.5 py-1.5 text-[12px] text-amber-100/90"><span className="font-medium">Nick REVISE{l.revise_pending ? " (not rewritten yet)" : " (rewritten)"}:</span> {l.nick_note}</p>
                  </td></tr>
                )}
                {openId === l.contact_id && (
                  <tr className="bg-white/[0.02]"><td colSpan={9} className="px-2 pb-4 pt-1"><DraftPreview contactId={l.contact_id} version={version} /></td></tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Phone cards */}
      {data && data.leads.length > 0 && !wide && (
        <div className="space-y-2">
          {data.leads.map((l) => (
            <div key={l.contact_id} data-testid={`leadcard-${l.contact_id}`} className="block rounded-lg border border-white/[0.06] bg-black/30 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-100">{l.business}</p>
                  <p className="truncate text-[11px] text-slate-500">{l.email}</p>
                </div>
                <Badge className={STATUS_STYLE[l.email1_status] ?? ""}>{l.email1_status}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge className={l.lane === "website" ? "bg-[var(--accent)]/15 text-[var(--accent-soft)]" : "bg-white/5 text-slate-300"}>{l.lane}</Badge>
                <Badge className="bg-white/5 text-slate-400">{l.source}</Badge>
                <Badge className="bg-white/5 text-slate-400">{l.tier}</Badge>
                {l.nick_verdict && <Badge className="bg-white/5 text-slate-300">Nick {l.nick_verdict}</Badge>}
                {l.hold_reason && <Badge className="bg-amber-400/10 text-amber-200/90">{HOLD_LABEL[l.hold_reason] ?? l.hold_reason}</Badge>}
                {l.duplicate_of.length > 0 && <Badge className="bg-amber-400/15 text-amber-200">dup</Badge>}
              </div>
              {l.subject && (
                <button onClick={() => toggle(l.contact_id)} data-testid={`open-card-${l.contact_id}`} className="mt-2 flex min-h-[44px] w-full items-center justify-between gap-2 rounded-md border border-white/[0.06] px-2 text-left text-[12px] text-slate-300">
                  <span className="truncate">{l.subject}</span><span className="shrink-0 text-[var(--accent-soft)]">{openId === l.contact_id ? "Hide email" : "Read email"}</span>
                </button>
              )}
              {openId === l.contact_id && <div className="mt-2"><DraftPreview contactId={l.contact_id} version={version} /></div>}
              <p className={`mt-1.5 text-[12px] ${ACTION_HOT.test(l.next_action) ? "text-[var(--accent-soft)]" : "text-slate-400"}`}>→ {l.next_action}</p>
              {l.nick_verdict === "REVISE" && l.nick_note && <p className="mt-1.5 rounded-md bg-amber-400/5 px-2 py-1 text-[12px] text-amber-100/90">Nick: {l.nick_note}</p>}
              <div className="mt-2"><LeadActions lead={l} warmed={warmed} onDone={load} /></div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
