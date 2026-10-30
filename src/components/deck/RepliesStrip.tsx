"use client";

import { useEffect, useState } from "react";
import type { InboundItem } from "@/lib/field/inbound";

const LABEL: Record<string, string> = { reply_handoff_lisa: "Needs an answer", soft_hold: "Not now: hold", suppress_opt_out: "Opt-out: suppress" };

/** Ask NOVA (the dashboard chat) to do something. BrainChat listens for this. */
export function askNova(text: string) {
  window.dispatchEvent(new CustomEvent("nova:ask", { detail: text }));
}

/**
 * Unanswered inbound replies, first thing on the folders card. Checks AgentMail
 * every 3 minutes via /api/inbound (read + classify only, never replies).
 * Hidden when there's nothing waiting or AgentMail isn't set up.
 */
export function RepliesStrip() {
  const [items, setItems] = useState<InboundItem[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/inbound");
        if (!res.ok || !alive) return;
        const r: { matched: InboundItem[]; unmatched: InboundItem[] } = await res.json();
        const waiting = [...r.matched, ...r.unmatched].filter((i) => i.unanswered && i.suggested !== "ignore");
        // Real replies first, then not-now, then opt-outs; newest first within each.
        const rank = (i: InboundItem) => ["reply_handoff_lisa", "soft_hold", "suppress_opt_out"].indexOf(i.suggested);
        setItems(waiting.sort((a, b) => rank(a) - rank(b) || b.last_at.localeCompare(a.last_at)));
      } catch { /* AgentMail not configured or down: show nothing */ }
    };
    load();
    const t = setInterval(load, 180_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (!items.length) return null;
  const hot = items.filter((i) => i.suggested === "reply_handoff_lisa").length;

  return (
    <div data-testid="replies-strip" className={`mb-3 rounded-lg border px-3 py-2 ${hot ? "border-amber-300/50 bg-amber-300/10" : "border-white/10 bg-black/30"}`}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 text-left" aria-expanded={open}>
        <span className="flex items-center gap-2 text-[13px] font-semibold text-amber-100">
          {hot > 0 && <span className="h-2 w-2 animate-pulse rounded-full bg-amber-300" />}
          {items.length} {items.length === 1 ? "reply" : "replies"} waiting{hot ? ` · ${hot} need${hot === 1 ? "s" : ""} an answer` : ""}
        </span>
        <span className="font-mono text-[10px] text-amber-200/70">{open ? "hide" : "show"}</span>
      </button>
      {open && (
        <ul className="mt-2 max-h-[220px] space-y-2 overflow-y-auto pr-1">
          {items.map((i) => {
            const who = i.contact?.name ?? i.from;
            return (
              <li key={i.thread_id} className="rounded-md bg-black/30 px-2 py-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] text-slate-100">{who}</span>
                  <span className="shrink-0 text-[10px] text-amber-200/80">{LABEL[i.suggested] ?? i.suggested}</span>
                </div>
                {i.snippet && <p className="mt-0.5 line-clamp-2 text-[12px] text-slate-400">“{i.snippet}”</p>}
                <div className="mt-1.5 flex gap-1.5">
                  {i.contact && <a href={`/leads?open=${encodeURIComponent(i.contact.contact_id)}`} className="min-h-[28px] rounded-md border border-white/10 px-2 text-[11px] leading-[28px] text-slate-300 hover:border-[var(--accent)]/50">Open lead</a>}
                  {i.suggested !== "suppress_opt_out" && (
                    <button
                      onClick={() => askNova(`Draft a short, human reply to ${who} for me to review. Don't send it. They wrote: "${i.snippet || i.subject}". Suggested handling: ${i.reason}.`)}
                      className="min-h-[28px] rounded-md bg-[var(--accent)] px-2 text-[11px] font-medium text-black hover:bg-[var(--accent-bright)]"
                    >
                      Ask NOVA to draft
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
