"use client";

import { useEffect, useState } from "react";
import { groupActivity } from "@/lib/activity/group";

/**
 * Corner telemetry + outcome-phrased activity feed for the JARVIS deck.
 * Gates cyan on deep navy. Activity reads like results, not internal chatter:
 *   "Generated…", "Updated… because…", "Spawned subagent to…".
 */

function relAge(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

// ── Stat panel ──────────────────────────────────────────────────────────────

export interface Stat {
  label: string;
  value: string;
  sub?: string;
  bar?: number; // 0..100 → mini usage bar
}

export function StatPanel({ title, stats, onClick, "data-testid": testId = "stat-panel" }: { title: string; stats: Stat[]; onClick?: () => void; "data-testid"?: string }) {
  return (
    <div
      data-testid={testId}
      onClick={onClick}
      className={`deck-card rounded-2xl p-3 backdrop-blur ${onClick ? "cursor-pointer transition-colors hover:border-[var(--accent)]/50" : ""}`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="h-1 w-4 bg-[var(--accent)]" />
        <span className="font-mono text-[13px] uppercase tracking-[0.28em] text-[var(--accent-soft)]">{title}</span>
      </div>
      <div className="space-y-2">
        {stats.map((s) => (
          <div key={s.label} data-testid={`stat-${s.label}`}>
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[13px] uppercase tracking-wider text-slate-500">{s.label}</span>
              <span className="font-mono text-sm text-slate-100">
                {s.value}
                {s.sub && <span className="ml-1 text-[13px] text-slate-500">{s.sub}</span>}
              </span>
            </div>
            {typeof s.bar === "number" && (
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/5">
                <div className="h-full rounded-full bg-gradient-to-r from-[var(--accent-deep)] to-[var(--accent)]" style={{ width: `${Math.min(100, Math.max(0, s.bar))}%` }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Activity feed (outcome-phrased) ─────────────────────────────────────────

export type ActivityKind = "generated" | "updated" | "spawned" | "connected" | "sent" | "queried" | "alert";

export interface Activity {
  id: string;
  kind: ActivityKind;
  target: string; // the thing acted on, e.g. "Q3 board report"
  because?: string; // rationale for "updated … because …"
  agent?: string; // which specialist
  at: string; // "2m", "just now"
  ts: string; // raw ISO time, used to group same-day items
}

const KIND_META: Record<ActivityKind, { verb: string; color: string; icon: string }> = {
  generated: { verb: "Generated", color: "var(--accent)", icon: "✦" },
  updated:   { verb: "Updated",   color: "#00b7ff",       icon: "↻" },
  spawned:   { verb: "Spawned subagent to", color: "#7fdfff", icon: "⌁" },
  connected: { verb: "Connected", color: "#7dd3fc",       icon: "⇄" },
  sent:      { verb: "Sent",      color: "#a3e635",       icon: "➤" },
  queried:   { verb: "Queried",   color: "#7fdfff",       icon: "⌕" },
  alert:     { verb: "Flagged",   color: "#ff3b30",       icon: "!" },
};

/** Failures that only mean "waiting on warm-up or on Thomas's approval": expected right now, not real problems. */
const WAITING = /warm-?up|domainwarmed|approv|isn't done yet|only thomas|thomas only|thomas or lisa only|we sent email 1|only move forward/i;
export const isWaitingBlock = (a: Pick<Activity, "kind" | "target" | "because">) => a.kind === "alert" && WAITING.test(`${a.target} ${a.because ?? ""}`);
const HIDE_KEY = "activity_hide_blocked";

export function ActivityFeed({
  "data-testid": testId = "activity-feed",
  limit = 20,
  href,
  filterable = false,
  className = "",
}: { "data-testid"?: string; limit?: number; href?: string; filterable?: boolean; className?: string }) {
  const [items, setItems] = useState<Activity[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [agent, setAgent] = useState("");
  const [kind, setKind] = useState("");
  const [lookups, setLookups] = useState(false);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggleOpen = (key: string) => setOpen((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const [hideBlocked, setHideBlocked] = useState(() => { try { return typeof window !== "undefined" && localStorage.getItem(HIDE_KEY) === "1"; } catch { return false; } });
  const toggleBlocked = () => setHideBlocked((v) => { try { localStorage.setItem(HIDE_KEY, v ? "0" : "1"); } catch {} return !v; });

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/activity?limit=${limit}&lookups=${lookups ? 1 : 0}`);
        const data = await res.json();
        if (alive) {
          setItems((data.activity ?? []).map((a: Activity) => ({ ...a, ts: a.at, at: relAge(a.at) })));
          setLoaded(true);
        }
      } catch {
        if (alive) setLoaded(true);
      }
    };
    load();
    const t = setInterval(load, 15000); // keep it consistent/live
    return () => { alive = false; clearInterval(t); };
  }, [limit, lookups]);

  const agents = [...new Set(items.map((a) => a.agent).filter(Boolean))] as string[];
  const blocked = items.filter(isWaitingBlock).length;
  const shown = items.filter((a) => (!agent || a.agent === agent) && (!kind || a.kind === kind) && !(hideBlocked && isWaitingBlock(a)));
  const entries = groupActivity(shown);

  return (
    <div
      data-testid={testId}
      className={`flex min-h-0 flex-col deck-card rounded-2xl p-3 backdrop-blur ${className}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-1 w-4 bg-[var(--accent)]" />
          {href ? (
            <a href={href} data-testid="activity-open" className="inline-flex min-h-[44px] items-center font-mono lg:min-h-0 text-[13px] uppercase tracking-[0.28em] text-[var(--accent-soft)] hover:text-[var(--accent)]">Activity →</a>
          ) : (
            <span className="font-mono text-[13px] uppercase tracking-[0.28em] text-[var(--accent-soft)]">Activity</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {loaded && (blocked > 0 || hideBlocked) && (
            <button onClick={toggleBlocked} data-testid="activity-hide-blocked" aria-pressed={hideBlocked}
              title="Failures caused by warm-up not confirmed or nothing approved yet"
              className={`min-h-[28px] rounded-md border px-2 font-mono text-[13px] ${hideBlocked ? "border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[var(--accent)]" : "border-white/10 text-slate-400 hover:border-[var(--accent)]/40"}`}>
              {hideBlocked ? `Show blocked (${blocked})` : `Hide blocked (${blocked})`}
            </button>
          )}
          <span className="flex items-center gap-1.5 font-mono text-[13px] text-[var(--accent-soft)]"><span className="live-dot" />live</span>
        </div>
      </div>
      {filterable && (
        <div className="mb-3 flex flex-wrap gap-2">
          <select value={agent} onChange={(e) => setAgent(e.target.value)} data-testid="activity-agent" aria-label="Agent" className="min-h-[36px] rounded-md border border-white/10 bg-black/40 px-2 text-[14px] text-slate-200">
            <option value="">All agents</option>
            {agents.map((a) => <option key={a}>{a}</option>)}
          </select>
          <select value={kind} onChange={(e) => setKind(e.target.value)} data-testid="activity-kind" aria-label="Kind" className="min-h-[36px] rounded-md border border-white/10 bg-black/40 px-2 text-[14px] text-slate-200">
            <option value="">All kinds</option>
            {Object.keys(KIND_META).map((k) => <option key={k}>{k}</option>)}
          </select>
          <label className="flex items-center gap-1.5 self-center text-[14px] text-slate-400">
            <input type="checkbox" checked={lookups} onChange={(e) => setLookups(e.target.checked)} data-testid="activity-lookups" /> Show lookups
          </label>
          <span className="self-center font-mono text-[13px] text-slate-500">{shown.length} shown</span>
        </div>
      )}
      {loaded && items.length === 0 && (
        <p className="py-6 text-center text-[14px] text-[var(--mute)]">Nothing yet. Bot calls, drafts and sends show up here as they happen.</p>
      )}
      <ul className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
        {entries.map((e) => {
          if (e.type === "single") return <ActivityRow key={e.item.id} a={e.item} />;
          const isOpen = open.has(e.key);
          const first = e.items[0];
          const m = KIND_META[first.kind];
          const becauses = [...new Set(e.items.map((i) => i.because ?? ""))];
          return (
            <li key={e.key} data-testid="activity-group" className="border-l border-white/[0.05] pl-2.5 hover:border-[var(--accent)]/50">
              <button type="button" onClick={() => toggleOpen(e.key)} aria-expanded={isOpen} data-testid="activity-group-toggle"
                className="log-line flex w-full gap-2.5 text-left">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md text-[13px]" style={{ color: m.color, background: "rgba(255,255,255,0.03)", boxShadow: `inset 0 0 0 1px ${m.color}40, 0 0 10px -2px ${m.color}66` }}>
                  {m.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-start justify-between gap-2 text-[15px] leading-snug" style={first.kind === "alert" ? { color: m.color } : undefined}>
                    <span className={first.kind === "alert" ? "" : "text-slate-100"}>{e.summary}</span>
                    <span className={`mt-0.5 shrink-0 font-mono text-[13px] text-[var(--accent-soft)] transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden>▾</span>
                  </p>
                  {becauses.length === 1 && becauses[0] && <p className="mt-0.5 line-clamp-2 text-[14px] leading-snug text-slate-500">{becauses[0]}</p>}
                  <p className="mt-0.5 font-mono text-[13px] text-slate-600">
                    {first.agent ? `${first.agent.charAt(0).toUpperCase()}${first.agent.slice(1)} · ` : ""}latest {first.at} · {isOpen ? "tap to collapse" : `tap to see all ${e.items.length}`}
                  </p>
                </div>
              </button>
              {isOpen && (
                <ul className="mt-2 ml-2 space-y-2 border-l border-[var(--accent)]/20 pl-2.5" data-testid="activity-group-items">
                  {e.items.map((a) => <ActivityRow key={a.id} a={a} />)}
                </ul>
              )}
            </li>
          );
        })}
        {loaded && <li className="log-cursor pl-2.5 font-mono text-[13px] text-[var(--mute)]" aria-hidden>listening for bot calls</li>}
      </ul>
    </div>
  );
}

function ActivityRow({ a }: { a: Activity }) {
  const m = KIND_META[a.kind];
  return (
    <li data-testid={`activity-${a.id}`} className="log-line flex gap-2.5 border-l border-white/[0.05] pl-2.5 hover:border-[var(--accent)]/50">
      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md text-[13px]" style={{ color: m.color, background: "rgba(255,255,255,0.03)", boxShadow: `inset 0 0 0 1px ${m.color}40, 0 0 10px -2px ${m.color}66` }}>
        {m.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-snug" style={a.kind === "alert" ? { color: m.color } : undefined}>
          <span className={a.kind === "alert" ? "" : "text-slate-100"}>{a.target}</span>
        </p>
        {a.because && <p className="mt-0.5 line-clamp-2 text-[14px] leading-snug text-slate-500">{a.because}</p>}
        <p className="mt-0.5 font-mono text-[13px] text-slate-600">
          {a.agent ? `${a.agent.charAt(0).toUpperCase()}${a.agent.slice(1)} · ` : ""}{a.at}
        </p>
      </div>
    </li>
  );
}
