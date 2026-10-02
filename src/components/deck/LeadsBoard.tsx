"use client";

import { useCallback, useEffect, useState } from "react";
import { LeadActions } from "./LeadActions";

/** Control Center "Today's leads": every lead for a date with lane, state and next action (reads the Brain DB). */
interface Lead {
  contact_id: string; business: string; contact_name: string | null; email: string; lane: "core" | "website"; source: string; tier: "High" | "Med" | "Soft";
  email1_status: string; nick_verdict: string | null; nick_note: string | null; approved: boolean; sent_at: string | null; subject: string | null;
  lint_issues: number; suppressed: boolean; replied: boolean; duplicate_of: string[]; next_action: string;
}
interface Counts { core: number; website: number; drafted: number; awaitingNick: number; passAwaitingApprove: number; approvedUnsent: number; softHold: number; total: number; duplicates: number }
interface Data { date: string; counts: Counts; sentToday: number; gates: { domainWarmed: boolean; warmNote: string; dailyCap: number }; leads: Lead[] }

const STATUSES = ["undrafted", "drafted", "atNick", "PASS", "approved", "sent", "hold", "kill"];
const STATUS_STYLE: Record<string, string> = {
  undrafted: "bg-white/5 text-slate-400", drafted: "bg-sky-400/10 text-sky-300", atNick: "bg-violet-400/10 text-violet-300",
  PASS: "bg-[var(--accent)]/15 text-[var(--accent)]", approved: "bg-emerald-400/15 text-emerald-300", sent: "bg-emerald-400/5 text-emerald-200/70",
  hold: "bg-amber-400/10 text-amber-200", kill: "bg-red-500/10 text-red-300",
};
const ACTION_HOT = /Approve|Nick audit|draft|Fix copy|send|Duplicate/i;
const sel = "min-h-[36px] rounded-md border border-white/10 bg-black/40 px-2 text-[12px] text-slate-200 outline-none focus:border-[var(--accent)]/60";

function Badge({ children, className, testId }: { children: React.ReactNode; className: string; testId?: string }) {
  return <span data-testid={testId} className={`inline-block rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${className}`}>{children}</span>;
}

export type LeadFilters = { date?: string; lane?: string; status?: string; tier?: string };

export function LeadsBoard({ initial = {} }: { initial?: LeadFilters }) {
  const [date, setDate] = useState(initial.date ?? "");
  const [lane, setLane] = useState(initial.lane ?? "");
  const [status, setStatus] = useState(initial.status ?? "");
  const [tier, setTier] = useState(initial.tier ?? "");
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
  // Duplicate rows merge into their Notion twin (it has the draft + Notion link).
  const notionTwin = (l: Lead) => data?.leads.find((x) => l.duplicate_of.includes(x.contact_id) && x.source === "notion")?.contact_id;
  const warmed = Boolean(data?.gates.domainWarmed);
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
      {data && data.leads.length > 0 && (
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-[12px]">
            <thead className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">
              <tr>{["Lead", "Lane", "Source", "Tier", "Email 1", "Nick", "Subject", "Next action", "Actions"].map((h) => <th key={h} className="px-2 py-1.5 font-normal">{h}</th>)}</tr>
            </thead>
            <tbody>
              {data.leads.map((l) => (
                <tr key={l.contact_id} data-testid={`lead-${l.contact_id}`} data-status={l.email1_status} className="border-t border-white/[0.05] align-top hover:bg-white/[0.02]">
                  <td className="px-2 py-2">
                    <a href="/field" className="text-slate-100 hover:text-[var(--accent-soft)]">{l.business}</a>
                    {l.duplicate_of.length > 0 && <Badge testId="lead-dup" className="ml-1.5 bg-amber-400/15 text-amber-200">dup</Badge>}
                    <p className="text-[11px] text-slate-500">{[l.contact_name, l.email].filter(Boolean).join(" · ")}</p>
                  </td>
                  <td className="px-2 py-2"><Badge testId="lead-lane" className={l.lane === "website" ? "bg-[var(--accent)]/15 text-[var(--accent-soft)]" : "bg-white/5 text-slate-300"}>{l.lane}</Badge></td>
                  <td className="px-2 py-2 font-mono text-[11px] text-slate-400">{l.source}</td>
                  <td className="px-2 py-2 font-mono text-[11px] text-slate-300">{l.tier}</td>
                  <td className="px-2 py-2"><Badge testId="lead-status" className={STATUS_STYLE[l.email1_status] ?? ""}>{l.email1_status}</Badge>{l.lint_issues > 0 && <span className="ml-1 font-mono text-[10px] text-red-300">lint {l.lint_issues}</span>}</td>
                  <td className="max-w-[180px] px-2 py-2 text-[11px] text-slate-400" title={l.nick_note ?? undefined}>{l.nick_verdict ? <><span className="text-slate-200">{l.nick_verdict}</span>{l.nick_note ? ` · ${l.nick_note.slice(0, 60)}` : ""}</> : "—"}</td>
                  <td className="max-w-[220px] truncate px-2 py-2 text-[11px] text-slate-400" title={l.subject ?? undefined}>{l.subject ?? "—"}</td>
                  <td className={`max-w-[200px] px-2 py-2 text-[12px] ${ACTION_HOT.test(l.next_action) ? "text-[var(--accent-soft)]" : "text-slate-400"}`} data-testid="lead-next">{l.next_action}</td>
                  <td className="px-2 py-2"><LeadActions lead={l} warmed={warmed} notionTwin={notionTwin(l)} onDone={load} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Phone cards */}
      {data && data.leads.length > 0 && (
        <div className="space-y-2 md:hidden">
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
                {l.duplicate_of.length > 0 && <Badge className="bg-amber-400/15 text-amber-200">dup</Badge>}
              </div>
              {l.subject && <p className="mt-2 truncate text-[12px] text-slate-400">{l.subject}</p>}
              <p className={`mt-1.5 text-[12px] ${ACTION_HOT.test(l.next_action) ? "text-[var(--accent-soft)]" : "text-slate-400"}`}>→ {l.next_action}</p>
              <div className="mt-2"><LeadActions lead={l} warmed={warmed} notionTwin={notionTwin(l)} onDone={load} /></div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
