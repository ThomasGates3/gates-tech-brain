"use client";

import { useEffect, useState } from "react";

interface Nudge { id: string; tone: "info" | "warn" | "good"; text: string }
const DOT: Record<Nudge["tone"], string> = { info: "#ffb066", warn: "#ff3b30", good: "#ffc042" };

/** Proactive "NOVA noticed…" surface — real observations, not chatter. */
export function NovaNoticed({ name }: { name: string }) {
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const d = await (await fetch("/api/nudges")).json();
        if (alive) setNudges(d.nudges ?? []);
      } catch { /* ignore */ }
    };
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const shown = nudges.filter((n) => !dismissed.has(n.id));
  if (!shown.length) return null;

  return (
    <div className="mb-4 space-y-2" data-testid="nova-noticed">
      {shown.map((n) => (
        <div key={n.id} className="flex items-center gap-3 rounded-xl border border-[var(--accent-deep)]/30 bg-[var(--panel)]/60 px-4 py-2.5 backdrop-blur" data-testid={`nudge-${n.id}`}>
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full" style={{ background: DOT[n.tone] }} />
          <p className="flex-1 text-[13px] text-zinc-300">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--accent-soft)]">{name} noticed · </span>
            {n.text}
          </p>
          <button onClick={() => setDismissed((s) => new Set(s).add(n.id))} className="shrink-0 text-zinc-600 hover:text-zinc-300" aria-label="Dismiss" data-testid={`nudge-dismiss-${n.id}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
      ))}
    </div>
  );
}
