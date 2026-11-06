"use client";

import Link from "next/link";
import { Ticker } from "./Ticker";

/**
 * Today's Field pipeline as a live flow: Draft → Nick → PASS → Approved → Sent.
 * Counts come straight from today's leads (/api/leads) and today's real sends. The step
 * that's waiting on Thomas glows; light pulses travel along links that have work in them.
 */
export interface PipeLead { email1_status: string }

export function pipelineCounts(leads: PipeLead[], sentToday: number) {
  const n = (s: string) => leads.filter((l) => l.email1_status === s).length;
  return [
    { key: "undrafted", label: "To draft", count: n("undrafted"), href: "/leads?status=undrafted", you: false },
    { key: "nick", label: "With Nick", count: n("drafted") + n("atNick"), href: "/leads?status=atNick", you: false },
    { key: "PASS", label: "Approve", count: n("PASS"), href: "/leads?status=PASS", you: true },
    { key: "approved", label: "Ready to send", count: n("approved"), href: "/leads?status=approved", you: true },
    { key: "sent", label: "Sent today", count: sentToday, href: "/leads?status=sent", you: false },
  ];
}

export function PipelineFlow({ leads, sentToday, vertical = false, loading = false }: { leads: PipeLead[]; sentToday: number; vertical?: boolean; loading?: boolean }) {
  const steps = pipelineCounts(leads, sentToday);
  return (
    <ol className={vertical ? "relative space-y-3 pl-1" : "flex items-start"} data-testid="pipeline">
      {steps.map((s, i) => {
        const hot = s.you && s.count > 0;
        const flowing = i < steps.length - 1 && s.count > 0;
        return (
          <li key={s.key} className={vertical ? "relative flex items-center gap-4" : "relative flex min-w-0 flex-1 flex-col items-center"}>
            {/* link to the next step */}
            {i < steps.length - 1 && (
              <span aria-hidden className={vertical ? "pipe-link-v absolute left-[27px] top-[56px] h-[calc(100%-44px)] w-px" : "pipe-link absolute left-[calc(50%+34px)] w-[calc(100%-68px)] top-[27px] h-px"} data-flowing={flowing || undefined} />
            )}
            <Link
              href={s.href}
              data-testid={`pipe-${s.key}`}
              data-hot={hot || undefined}
              className={`pipe-node relative grid h-14 w-14 shrink-0 place-items-center rounded-full font-mono text-[19px] ${hot ? "text-white" : s.count ? "text-slate-100" : "text-[var(--mute)]"}`}
            >
              {loading ? "—" : <Ticker value={s.count} />}
            </Link>
            <div className={vertical ? "min-w-0" : "mt-2 text-center"}>
              <p className={`text-[14px] ${hot ? "text-[var(--accent-soft)]" : "text-[var(--body)]"}`}>{s.label}</p>
              {s.you && <p className="font-mono text-[13px] uppercase tracking-[0.14em] text-[var(--mute)]">your move</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
