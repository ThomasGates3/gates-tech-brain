"use client";

import { useEffect, useState } from "react";

/**
 * Corner telemetry + outcome-phrased activity feed for the JARVIS deck.
 * Deep-orange on black. Activity reads like results, not internal chatter:
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
      className={`rounded-xl border border-[var(--accent-deep)]/30 bg-[var(--panel)]/70 p-3 backdrop-blur ${onClick ? "cursor-pointer transition-colors hover:border-[var(--accent)]/50" : ""}`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="h-1 w-4 bg-[var(--accent)]" />
        <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--accent-soft)]">{title}</span>
      </div>
      <div className="space-y-2">
        {stats.map((s) => (
          <div key={s.label} data-testid={`stat-${s.label}`}>
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">{s.label}</span>
              <span className="font-mono text-sm text-zinc-100">
                {s.value}
                {s.sub && <span className="ml-1 text-[10px] text-zinc-500">{s.sub}</span>}
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
}

const KIND_META: Record<ActivityKind, { verb: string; color: string; icon: string }> = {
  generated: { verb: "Generated", color: "var(--accent)", icon: "✦" },
  updated:   { verb: "Updated",   color: "#ffab40",       icon: "↻" },
  spawned:   { verb: "Spawned subagent to", color: "#ffc042", icon: "⌁" },
  connected: { verb: "Connected", color: "#7dd3fc",       icon: "⇄" },
  sent:      { verb: "Sent",      color: "#a3e635",       icon: "➤" },
  queried:   { verb: "Queried",   color: "#ffb066",       icon: "⌕" },
  alert:     { verb: "Flagged",   color: "#ff3b30",       icon: "!" },
};

export function ActivityFeed({ "data-testid": testId = "activity-feed" }: { "data-testid"?: string }) {
  const [items, setItems] = useState<Activity[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/activity?limit=20");
        const data = await res.json();
        if (alive) {
          setItems((data.activity ?? []).map((a: Activity) => ({ ...a, at: relAge(a.at) })));
          setLoaded(true);
        }
      } catch {
        if (alive) setLoaded(true);
      }
    };
    load();
    const t = setInterval(load, 15000); // keep it consistent/live
    return () => { alive = false; clearInterval(t); };
  }, []);

  return (
    <div
      data-testid={testId}
      className="rounded-xl border border-[var(--accent-deep)]/30 bg-[var(--panel)]/70 p-3 backdrop-blur"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-1 w-4 bg-[var(--accent)]" />
          <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--accent-soft)]">Activity</span>
        </div>
        <span className="font-mono text-[10px] text-zinc-600">live</span>
      </div>
      {loaded && items.length === 0 && (
        <p className="py-6 text-center text-[12px] text-zinc-600">Nothing yet — run an automation or a dev task and it shows up here.</p>
      )}
      <ul className="space-y-2.5">
        {items.map((a) => {
          const m = KIND_META[a.kind];
          return (
            <li key={a.id} data-testid={`activity-${a.id}`} className="flex gap-2.5">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md text-[11px]" style={{ color: m.color, background: "rgba(255,255,255,0.03)", boxShadow: `inset 0 0 0 1px ${m.color}33` }}>
                {m.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-snug text-zinc-300">
                  <span style={{ color: m.color }}>{m.verb}</span>{" "}
                  <span className="text-zinc-100">{a.target}</span>
                  {a.because && <span className="text-zinc-500"> — because {a.because}</span>}
                </p>
                <p className="mt-0.5 font-mono text-[10px] text-zinc-600">
                  {a.agent ? `${a.agent} · ` : ""}{a.at}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
