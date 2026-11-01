"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { type OrbState } from "@/components/hud/CoreOrb";
import { BrainChat } from "@/components/deck/BrainChat";
import { MobileConsole } from "@/components/deck/MobileConsole";
import { BootSequence } from "@/components/deck/BootSequence";
import { ActivityFeed, type Stat } from "@/components/deck/Telemetry";
import { SystemStatPanel } from "@/components/deck/SystemStatPanel";
import { Scoreboard, type ScoreboardData } from "@/components/deck/Scoreboard";
import { LeadsCard } from "@/components/deck/LeadsCard";
import { QuickLinks } from "@/components/deck/QuickLinks";
import { TopNav } from "@/components/deck/TopNav";
import { CommandHero } from "@/components/deck/CommandHero";
import { PipelineFlow } from "@/components/deck/PipelineFlow";
import { useLeads } from "@/lib/ux/useLeads";
import type { BriefingHighlight } from "@/lib/persona/presets";
import { getPreset } from "@/lib/persona/presets";
import { getGreeting } from "@/lib/ux/helpers";
import { speak, cancelSpeech } from "@/lib/ux/speak";

/** Live deck state from /api/deck (Field-real numbers only; "—" until loaded). */
interface DeckState {
  briefing: { lead: string; items: BriefingHighlight[]; next: string[] };
  ops: Stat[];
  scoreboard: ScoreboardData;
  readouts: { tier: string; activeAgents: number; sent: string; claude: string };
  budget?: { spentUsd: number; capUsd: number; warnUsd: number; status: string };
}

/** Today's flow, Draft → Sent, as a glowing pipeline. */
function PipelineCard() {
  const { data } = useLeads();
  return (
    <section className="deck-card shrink-0 rounded-2xl px-4 pb-3 pt-3" data-testid="pipeline-card">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--accent-soft)]"><span className="h-1 w-4 bg-[var(--accent)]" />Today&apos;s pipeline</span>
        <span className="font-mono text-[10px] text-[var(--mute)]">{data ? `${data.leads.length} leads · ${data.date}` : "…"}</span>
      </div>
      <PipelineFlow leads={data?.leads ?? []} sentToday={data?.sentToday ?? 0} loading={!data} />
    </section>
  );
}

/** true on lg+ screens, false below, null during SSR: mounts one layout. */
const LG = "(min-width: 1024px)";
function useIsDesktop(): boolean | null {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(LG); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
    () => window.matchMedia(LG).matches,
    () => null
  );
}

export default function Home() {
  const isDesktop = useIsDesktop();
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [booting, setBooting] = useState(true);
  const [deck, setDeck] = useState<DeckState | null>(null);
  const preset = getPreset("agency"); // Gates Brain persona (NOVA)
  const spoken = useMemo(
    () => (deck ? `${getGreeting()}. I'm ${preset.name}. ${deck.briefing.next.slice(0, 2).join(" ")}` : ""),
    [deck, preset.name]
  );

  // Real deck numbers, refreshed every 30s.
  const loadDeck = () => { fetch("/api/deck").then((r) => r.json()).then((d) => d.briefing && setDeck(d)).catch(() => {}); };
  useEffect(() => {
    const first = setTimeout(loadDeck, 0);
    const t = setInterval(loadDeck, 30000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, []);

  // Boot sequence once per session.
  useEffect(() => {
    if (sessionStorage.getItem("booted")) { setBooting(false); return; }
  }, []);
  const finishBoot = () => { sessionStorage.setItem("booted", "1"); setBooting(false); };

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", preset.accent);
  }, [preset.accent]);

  // Spoken briefing after boot, once real data is in (respects a mute preference).
  const spokenOnce = useRef(false);
  useEffect(() => {
    if (booting || !spoken || spokenOnce.current) return;
    spokenOnce.current = true;
    if (localStorage.getItem("mute_briefing") === "1") return;
    const t = setTimeout(() => void speak(spoken), 400);
    return () => { clearTimeout(t); cancelSpeech(); };
  }, [booting, spoken]);

  // Orb flashes when new activity lands (success / alert).
  const lastActivityId = useRef<string | null>(null);
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const d = await (await fetch("/api/activity?limit=1")).json();
        const top = d.activity?.[0];
        if (!top || !alive) return;
        if (lastActivityId.current && lastActivityId.current !== top.id) {
          setOrbState(top.kind === "alert" ? "error" : "success");
          setTimeout(() => setOrbState("idle"), 2600);
        }
        lastActivityId.current = top.id;
      } catch { /* ignore */ }
    };
    poll();
    const t = setInterval(poll, 10000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const pulse = () => { setOrbState("thinking"); setTimeout(() => setOrbState("idle"), 2600); };
  const sb = deck?.scoreboard;

  return (
    <div className="relative isolate min-h-screen bg-[#02050c] font-sans text-slate-100">
      {booting && <BootSequence name={preset.name} accent={preset.accent} onDone={finishBoot} />}
      <div aria-hidden className="deck-bg" />
      <TopNav />

      {/* Desktop: one screen, no page scroll. Cards scroll inside themselves. */}
      {isDesktop && (
        <main className="relative grid h-[calc(100dvh-3.5rem)] w-full grid-cols-[260px_minmax(0,1fr)_360px] gap-4 overflow-hidden p-4 xl:grid-cols-[300px_minmax(0,1fr)_440px] 2xl:grid-cols-[340px_minmax(0,1fr)_520px] 2xl:px-6" data-testid="dashboard">
          <div className="flex min-h-0 flex-col gap-4">
            <ActivityFeed limit={25} href="/activity" className="min-h-0 flex-1" />
            <Link href="/settings" className="block shrink-0"><SystemStatPanel /></Link>
          </div>
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1 [scrollbar-width:thin]">
            <CommandHero deck={deck} orbState={orbState} name={preset.name} />
            <PipelineCard />
            <div className="flex min-h-[240px] flex-1 flex-col"><LeadsCard fill topCount={12} /></div>
            <BrainChat className="shrink-0" personaName={preset.name} onSend={pulse} onVoiceActive={(v) => v && pulse()} />
          </div>
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
            <Scoreboard data={sb ?? null} onChange={loadDeck} />
            <QuickLinks ops={deck?.ops ?? []} pass={sb?.passAwaitingApprove} drafted={deck ? Number(deck.briefing.items.find((i) => i.label === "Waiting on Nick")?.value ?? 0) : undefined} />
          </div>
        </main>
      )}

      {/* Phone: stacked cards; each opens its own page */}
      {isDesktop === false && (
        <main className="relative space-y-4 px-4 pb-28 pt-4">
          <CommandHero deck={deck} orbState={orbState} name={preset.name} />
          <div className="overflow-x-auto"><div className="min-w-[520px]"><PipelineCard /></div></div>
          <LeadsCard />
          <Scoreboard data={sb ?? null} onChange={loadDeck} />
          <QuickLinks ops={deck?.ops ?? []} pass={sb?.passAwaitingApprove} />
          <ActivityFeed limit={6} href="/activity" />
        </main>
      )}

      <MobileConsole personaName={preset.name} greeting={getGreeting()} />
    </div>
  );
}
