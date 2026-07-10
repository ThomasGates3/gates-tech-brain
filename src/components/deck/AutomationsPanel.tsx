"use client";

import { useMemo, useState } from "react";
import { listAutomations, type AutomationCategory } from "@/lib/automations/catalog";

const CATS: { id: AutomationCategory | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "real-estate", label: "Real Estate" },
  { id: "trading", label: "Trading" },
  { id: "content", label: "Content" },
  { id: "social", label: "Social" },
  { id: "ops", label: "Ops" },
];

const TRIGGER_BADGE: Record<string, string> = { cron: "scheduled", webhook: "on-event", manual: "on-demand" };

function placeholders(prompt: string): string[] {
  return [...new Set([...prompt.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))];
}

interface RunState {
  loading: boolean;
  output?: string;
  error?: string;
}

/** Browse and run the automation catalog from the deck. */
export function AutomationsPanel({ "data-testid": testId = "automations-panel" }: { "data-testid"?: string }) {
  const all = useMemo(() => listAutomations(), []);
  const [cat, setCat] = useState<AutomationCategory | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [runs, setRuns] = useState<Record<string, RunState>>({});

  const shown = cat === "all" ? all : all.filter((a) => a.category === cat);

  const run = async (id: string) => {
    setRuns((r) => ({ ...r, [id]: { loading: true } }));
    try {
      const res = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, vars }),
      });
      const data = await res.json();
      setRuns((r) => ({ ...r, [id]: { loading: false, output: data.output, error: data.error } }));
    } catch (e) {
      setRuns((r) => ({ ...r, [id]: { loading: false, error: e instanceof Error ? e.message : "Failed" } }));
    }
  };

  return (
    <div
      data-testid={testId}
      className="rounded-xl border border-[var(--accent-deep)]/30 bg-[var(--panel)]/70 p-4 backdrop-blur"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-1 w-4 bg-[var(--accent)]" />
          <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--accent-soft)]">Automations</span>
        </div>
        <span className="font-mono text-[10px] text-zinc-600">{shown.length} available</span>
      </div>

      {/* category filter */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {CATS.map((c) => (
          <button
            key={c.id}
            data-testid={`autocat-${c.id}`}
            onClick={() => setCat(c.id)}
            className={`min-h-[32px] rounded-full px-3 text-[11px] transition-colors ${
              cat === c.id ? "bg-[var(--accent)] text-black" : "bg-white/5 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* cards */}
      <div className="grid gap-2.5 sm:grid-cols-2">
        {shown.map((a) => {
          const ph = placeholders(a.prompt);
          const isOpen = openId === a.id;
          const st = runs[a.id];
          return (
            <div key={a.id} data-testid={`auto-${a.id}`} className="rounded-lg border border-white/[0.06] bg-black/30 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-100">{a.name}</p>
                  <p className="mt-0.5 text-[12px] leading-snug text-zinc-500">{a.description}</p>
                </div>
                <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-[var(--accent-soft)]">
                  {TRIGGER_BADGE[a.trigger.kind]}
                </span>
              </div>

              {/* var inputs (only when opened & has placeholders) */}
              {isOpen && ph.length > 0 && (
                <div className="mt-3 space-y-2">
                  {ph.map((p) => (
                    <input
                      key={p}
                      data-testid={`autovar-${p}`}
                      placeholder={p}
                      value={vars[p] ?? ""}
                      onChange={(e) => setVars((v) => ({ ...v, [p]: e.target.value }))}
                      className="min-h-[38px] w-full rounded-md border border-white/10 bg-black/40 px-2.5 text-[13px] text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-[var(--accent)]/60"
                    />
                  ))}
                </div>
              )}

              <div className="mt-3 flex items-center gap-2">
                {ph.length > 0 && !isOpen ? (
                  <button
                    data-testid={`auto-open-${a.id}`}
                    onClick={() => setOpenId(a.id)}
                    className="min-h-[36px] rounded-md border border-[var(--accent)]/40 px-3 text-[12px] text-[var(--accent-soft)] hover:bg-[var(--accent)]/10"
                  >
                    Configure & run
                  </button>
                ) : (
                  <button
                    data-testid={`auto-run-${a.id}`}
                    onClick={() => run(a.id)}
                    disabled={st?.loading}
                    className="min-h-[36px] rounded-md bg-[var(--accent)] px-3 text-[12px] font-medium text-black transition-colors hover:bg-[var(--accent-bright)] disabled:opacity-50"
                  >
                    {st?.loading ? "Running…" : "Run now"}
                  </button>
                )}
              </div>

              {/* result */}
              {st && !st.loading && (st.output || st.error) && (
                <div className="mt-3 rounded-md border border-white/5 bg-black/40 p-2.5" data-testid={`auto-result-${a.id}`}>
                  {st.error ? (
                    <p className="text-[12px] text-[var(--orb-error,#ff3b30)]">{st.error}</p>
                  ) : (
                    <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-zinc-300">{st.output}</pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
