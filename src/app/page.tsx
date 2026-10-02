"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import HudFrame from "@/components/hud/HudFrame";
import type { OrbState } from "@/components/hud/CoreOrb";
import { BrainChat } from "@/components/deck/BrainChat";
import { MobileConsole } from "@/components/deck/MobileConsole";
import { AutomationsPanel } from "@/components/deck/AutomationsPanel";
import { BootSequence } from "@/components/deck/BootSequence";
import { NovaNoticed } from "@/components/deck/NovaNoticed";
import { StatPanel, ActivityFeed, type Stat } from "@/components/deck/Telemetry";
import { SystemStatPanel } from "@/components/deck/SystemStatPanel";
import { Scoreboard, type ScoreboardData } from "@/components/deck/Scoreboard";
import { LeadsCard } from "@/components/deck/LeadsCard";
import { SettingsModal, ConnectionsModal, BriefingDetailModal } from "@/components/deck/DeckModals";
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
}

/** true on lg+ screens, false below, null during SSR: mounts exactly one leads board. */
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
  const [voiceActive, setVoiceActive] = useState(false);
  const [modal, setModal] = useState<"settings" | "connections" | null>(null);
  const [briefItem, setBriefItem] = useState<BriefingHighlight | null>(null);
  const [booting, setBooting] = useState(true);
  const [deck, setDeck] = useState<DeckState | null>(null);
  const preset = getPreset("agency"); // Gates Brain persona (NOVA)
  const spoken = useMemo(
    () => (deck ? `${getGreeting()}. I'm ${preset.name}. ${deck.briefing.lead} ${deck.briefing.items.map((i) => `${i.label}: ${i.value}`).slice(0, 3).join(". ")}.` : ""),
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

  // Persona skin — drive the whole theme accent off the active vertical.
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

  // Live orb reactions — flash when new activity lands (success amber / error red).
  const lastActivityId = useRef<string | null>(null);
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const d = await (await fetch("/api/activity?limit=1")).json();
        const top = d.activity?.[0];
        if (!top || !alive) return;
        if (lastActivityId.current && lastActivityId.current !== top.id) {
          const s: OrbState = top.kind === "alert" ? "error" : "success";
          setOrbState(s);
          setTimeout(() => setOrbState("idle"), 2600);
        }
        lastActivityId.current = top.id;
      } catch { /* ignore */ }
    };
    poll();
    const t = setInterval(poll, 10000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const readouts = [
    { label: "CORE", value: "ONLINE", color: preset.accent },
    { label: "TIER", value: deck?.readouts.tier ?? "—" },
    { label: "AGENTS", value: deck ? `${deck.readouts.activeAgents} ACTIVE` : "—" },
    { label: "CLAUDE", value: deck?.readouts.claude ?? "—" },
  ];

  const pulse = () => { setOrbState("thinking"); setTimeout(() => setOrbState("idle"), 2600); };
  const muteBriefing = () => { localStorage.setItem("mute_briefing", "1"); cancelSpeech(); };

  return (
    <div className="min-h-screen bg-black text-slate-100 font-sans">
      {booting && <BootSequence name={preset.name} accent={preset.accent} onDone={finishBoot} />}

      {/* Ambient core glow + faint grid */}
      <div className="pointer-events-none fixed inset-0" style={{ background: "radial-gradient(900px 500px at 50% 8%, rgba(0,229,255,0.10), transparent 70%)" }} />
      <div className="pointer-events-none fixed inset-0 opacity-[0.05]" style={{ backgroundImage: "linear-gradient(var(--grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)", backgroundSize: "44px 44px" }} />

      {/* Desktop: full command deck */}
      <div className="relative mx-auto hidden max-w-[1400px] px-4 py-5 sm:px-6 lg:block">
        {/* Top status bar */}
        <header className="mb-5 flex items-center justify-between border-b border-[var(--accent-deep)]/30 pb-3">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--accent)]" style={{ boxShadow: "0 0 10px var(--accent)" }} />
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-slate-500">GATES TECH BRAIN</p>
              <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
                {getGreeting()}. All systems online — I&apos;m <span className="text-[var(--accent)]">{preset.name}</span>.
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a href="/field" data-testid="open-field" className="grid min-h-[36px] place-items-center rounded-lg border border-[var(--accent)]/40 px-3 font-mono text-[11px] uppercase tracking-wider text-[var(--accent-soft)] hover:bg-[var(--accent)]/10">Field →</a>
            <button onClick={muteBriefing} data-testid="mute-briefing" className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-slate-400 hover:text-slate-200" aria-label="Mute voice">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="m23 9-6 6M17 9l6 6" /></svg>
            </button>
            <div className="hidden font-mono text-[11px] text-slate-500 sm:block">
              <span className="text-[var(--accent-soft)]">{new Date().toLocaleDateString()}</span> · {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        </header>

        {/* Proactive nudges */}
        <NovaNoticed name={preset.name} />

        {/* 3-column JARVIS grid: activity | core+chat | stats */}
        <div className="grid gap-4 lg:grid-cols-[290px_minmax(0,1fr)_260px]">
          {/* Left — activity (real, DB-backed) */}
          <div className="order-3 lg:order-1">
            <ActivityFeed limit={12} href="/activity" />
          </div>

          {/* Center — centered orb, briefing, compact chat pinned to bottom */}
          <div className="order-1 flex flex-col gap-4 lg:order-2">
            {/* Centered core */}
            <div className="flex justify-center pt-1">
              <HudFrame orbState={voiceActive ? "thinking" : orbState} readouts={readouts} uptime={deck ? `SENT TODAY ${deck.readouts.sent}` : "—"} className="w-full max-w-[460px]" data-testid="deck-hud" />
            </div>

            <div>
              <div className="rounded-2xl border border-[var(--accent-deep)]/30 bg-[var(--panel)]/60 p-4 backdrop-blur">
                <div className="mb-3 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
                  <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--accent-soft)]">Briefing</span>
                </div>
                <p className="mb-3 text-sm text-slate-200" data-testid="briefing-lead">{deck?.briefing.lead ?? "Loading today's Field status…"}</p>
                <ul className="space-y-1.5">
                  {(deck?.briefing.items ?? []).map((it) => (
                    <li key={it.label} onClick={() => setBriefItem(it)} data-testid={`briefing-item-${it.label}`} className="flex cursor-pointer items-baseline justify-between gap-3 rounded border-b border-white/[0.04] pb-1.5 transition-colors last:border-0 hover:bg-white/[0.03]">
                      <span className={`text-[13px] ${it.urgent ? "text-[var(--accent-soft)]" : "text-slate-400"}`}>
                        {it.urgent && <span className="mr-1.5 text-[var(--accent)]">!</span>}
                        {it.label}
                      </span>
                      <span className="shrink-0 font-mono text-[13px] text-slate-100">{it.value}</span>
                    </li>
                  ))}
                </ul>
                {deck && deck.briefing.next.length > 1 && (
                  <ul className="mt-3 space-y-1 rounded-lg bg-[var(--accent)]/10 px-3 py-2 text-[12px] leading-5 text-[var(--accent-soft)] ring-1 ring-[var(--accent)]/20">
                    {deck.briefing.next.slice(1, 4).map((n) => <li key={n}>{n}</li>)}
                  </ul>
                )}
              </div>
            </div>

            {isDesktop && <LeadsCard />}

            {/* Compact chat pinned to the bottom */}
            <div className="mt-auto">
              <BrainChat personaName={preset.name} onSend={pulse} onVoiceActive={setVoiceActive} />
            </div>
          </div>

          {/* Right — stats (clickable) */}
          <div className="order-2 space-y-4 lg:order-3">
            <Scoreboard data={deck?.scoreboard ?? null} onChange={loadDeck} />
            <StatPanel title="Operations" stats={deck?.ops ?? []} onClick={() => setModal("connections")} />
            <SystemStatPanel onClick={() => setModal("settings")} />
          </div>
        </div>

        {/* Automations — run any playbook from here */}
        <div className="mt-4">
          <AutomationsPanel />
        </div>
      </div>

      {/* Phone: dashboard cards (each opens its own page) */}
      <div className="relative space-y-4 px-4 pb-28 pt-5 lg:hidden">
        <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-slate-500">GATES TECH BRAIN · CONTROL CENTER</p>
        {isDesktop === false && (
          <>
            <LeadsCard />
            <Scoreboard data={deck?.scoreboard ?? null} onChange={loadDeck} />
            <ActivityFeed limit={5} href="/activity" />
          </>
        )}
      </div>

      {/* Mobile floating orb → chat sheet */}
      <MobileConsole personaName={preset.name} greeting={getGreeting()} />

      {/* Interactive detail modals */}
      {modal === "settings" && <SettingsModal onClose={() => setModal(null)} />}
      {modal === "connections" && <ConnectionsModal onClose={() => setModal(null)} />}
      {briefItem && <BriefingDetailModal item={briefItem} onClose={() => setBriefItem(null)} />}
    </div>
  );
}
