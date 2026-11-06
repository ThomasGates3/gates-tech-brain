"use client";

import Link from "next/link";
import CoreOrb, { type OrbState } from "@/components/hud/CoreOrb";
import { Ticker } from "./Ticker";
import { RingGauge } from "./RingGauge";
import { getGreeting } from "@/lib/ux/helpers";

/**
 * The dashboard's focal point: how many drafts are waiting on Thomas, the next move,
 * and two gauges (sends vs daily cap, Claude spend vs daily cap). Real numbers only.
 * Glows (animated edge) only when something is actually waiting on him.
 */
export interface HeroDeck {
  briefing: { next: string[] };
  scoreboard: { sent: { value: number; cap: number }; passAwaitingApprove: number; approvedUnsent: number; domainWarmed: boolean };
  budget?: { spentUsd: number; capUsd: number; warnUsd: number; status: string };
}

const usd = (n: number) => `$${n.toFixed(2)}`;

export function CommandHero({ deck, orbState, name }: { deck: HeroDeck | null; orbState: OrbState; name: string }) {
  const sb = deck?.scoreboard;
  const pass = sb?.passAwaitingApprove ?? 0;
  const ready = sb?.approvedUnsent ?? 0;
  const waiting = pass > 0;
  const next = deck?.briefing.next ?? [];
  const b = deck?.budget;
  return (
    <section data-testid="command-hero" className={`deck-card hero-card relative shrink-0 overflow-hidden rounded-2xl p-5 ${waiting ? "attn" : ""}`}>
      <div aria-hidden className="hero-sheen" />
      <div className="relative flex flex-wrap items-center gap-5">
        <div className="relative shrink-0">
          <span aria-hidden className="orb-halo" />
          <CoreOrb state={orbState} className="relative h-14 w-14 xl:h-20 xl:w-20" />
        </div>
        <div className="min-w-[220px] flex-1">
          <p className="text-[15px] text-[var(--body)]">{getGreeting()}, Thomas · <span className="text-[var(--accent-soft)]">{name} online</span></p>
          {deck ? (
            <p className="mt-1 flex items-baseline gap-3" data-testid="hero-count">
              <span className="hero-number font-mono text-[44px] xl:text-[56px] font-medium leading-none"><Ticker value={pass} /></span>
              <span className="text-[18px] text-slate-100">{pass === 1 ? "draft waiting on you" : "drafts waiting on you"}</span>
            </p>
          ) : (
            <span className="skeleton mt-2 block h-12 w-72 rounded-lg" />
          )}
          <p className="mt-2 truncate text-[15px] text-[var(--accent-soft)]" data-testid="briefing-lead">{next[0] ? `→ ${next[0]}` : deck ? "Field is clear. Nothing waiting on you." : ""}</p>
          {next[1] && <p className="truncate text-[15px] text-[var(--mute)]">· {next[1]}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/leads?status=PASS" className="btn-primary min-h-[38px] px-4 text-[15px]" data-testid="hero-approve">{pass ? `Review ${pass}` : "Open leads"}</Link>
            {ready > 0 && <Link href="/leads?status=approved" className="btn-ghost min-h-[38px] px-4 text-[15px]">{ready} ready to send</Link>}
            <Link href="/m" className="btn-ghost hidden min-h-[38px] px-4 text-[15px] xl:inline-flex">Phone view</Link>
          </div>
        </div>
        <div className="flex shrink-0 gap-5">
          <RingGauge size={80} testId="ring-sends" label="Sends today" value={sb ? sb.sent.value : null} max={sb ? sb.sent.cap : null} sub={sb ? (sb.domainWarmed ? "warm-up ✓" : "warm-up ✗") : undefined} warnAt={0.9} />
          <RingGauge size={80} testId="ring-claude" label="Claude today" value={b ? b.spentUsd : null} max={b ? b.capUsd : null} format={usd} sub={b ? `warn at ${usd(b.warnUsd)}` : undefined} warnAt={b && b.capUsd ? b.warnUsd / b.capUsd : 0.8} />
        </div>
      </div>
    </section>
  );
}
