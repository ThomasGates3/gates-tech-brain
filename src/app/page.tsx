"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import HudFrame from "@/components/hud/HudFrame";
import type { OrbState } from "@/components/hud/CoreOrb";
import { BrainChat } from "@/components/deck/BrainChat";
import { MobileConsole } from "@/components/deck/MobileConsole";
import { AutomationsPanel } from "@/components/deck/AutomationsPanel";
import { BootSequence } from "@/components/deck/BootSequence";
import { NovaNoticed } from "@/components/deck/NovaNoticed";
import { StatPanel, ActivityFeed, type Stat } from "@/components/deck/Telemetry";
import { SystemStatPanel } from "@/components/deck/SystemStatPanel";
import { SettingsModal, ConnectionsModal, BriefingDetailModal } from "@/components/deck/DeckModals";
import type { BriefingHighlight } from "@/lib/persona/presets";
import { getPreset, getAllPresets, buildBriefing } from "@/lib/persona/presets";
import { getGreeting } from "@/lib/ux/helpers";
import type { Vertical } from "@/lib/types";

// ── Mock telemetry (wired to /api/chat + connectors in integration pass) ────

const OPS_STATS: Stat[] = [
  { label: "Connectors", value: "5 / 6", bar: 83 },
  { label: "Tool calls", value: "47", sub: "24h" },
  { label: "Active agents", value: "3", bar: 60 },
  { label: "Approvals", value: "1", sub: "pending" },
];

export default function Home() {
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [voiceActive, setVoiceActive] = useState(false);
  const [modal, setModal] = useState<"settings" | "connections" | null>(null);
  const [briefItem, setBriefItem] = useState<BriefingHighlight | null>(null);
  const [vertical, setVertical] = useState<Vertical>("agency");
  const [booting, setBooting] = useState(true);
  const preset = getPreset(vertical);
  const briefing = useMemo(() => buildBriefing(preset, getGreeting()), [preset]);

  // Boot sequence once per session.
  useEffect(() => {
    if (sessionStorage.getItem("booted")) { setBooting(false); return; }
  }, []);
  const finishBoot = () => { sessionStorage.setItem("booted", "1"); setBooting(false); };

  // Persona skin — drive the whole theme accent off the active vertical.
  useEffect(() => {
    document.documentElement.style.setProperty("--accent", preset.accent);
  }, [preset.accent]);

  // Spoken briefing after boot (respects a mute preference).
  useEffect(() => {
    if (booting) return;
    if (localStorage.getItem("mute_briefing") === "1") return;
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(briefing.spoken);
    u.rate = 1.02;
    const t = setTimeout(() => window.speechSynthesis.speak(u), 400);
    return () => { clearTimeout(t); window.speechSynthesis.cancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booting]);

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
    { label: "TIER", value: "STANDARD" },
    { label: "AGENTS", value: "3 ACTIVE" },
    { label: "UPTIME", value: "99.98%" },
  ];

  const pulse = () => { setOrbState("thinking"); setTimeout(() => setOrbState("idle"), 2600); };
  const muteBriefing = () => { localStorage.setItem("mute_briefing", "1"); window.speechSynthesis?.cancel(); };

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans">
      {booting && <BootSequence name={preset.name} accent={preset.accent} onDone={finishBoot} />}

      {/* Ambient core glow + faint grid */}
      <div className="pointer-events-none fixed inset-0" style={{ background: "radial-gradient(900px 500px at 50% 8%, rgba(255,106,0,0.10), transparent 70%)" }} />
      <div className="pointer-events-none fixed inset-0 opacity-[0.05]" style={{ backgroundImage: "linear-gradient(var(--grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)", backgroundSize: "44px 44px" }} />

      {/* Desktop: full command deck */}
      <div className="relative mx-auto hidden max-w-[1400px] px-4 py-5 sm:px-6 lg:block">
        {/* Top status bar */}
        <header className="mb-5 flex items-center justify-between border-b border-[var(--accent-deep)]/30 pb-3">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--accent)]" style={{ boxShadow: "0 0 10px var(--accent)" }} />
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-zinc-500">AI BRAIN</p>
              <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
                {getGreeting()}. All systems online — I&apos;m <span className="text-[var(--accent)]">{preset.name}</span>.
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select
              data-testid="vertical-switcher"
              value={vertical}
              onChange={(e) => setVertical(e.target.value as Vertical)}
              className="min-h-[36px] rounded-lg border border-white/10 bg-black/40 px-2.5 font-mono text-[11px] uppercase tracking-wider text-zinc-300 outline-none focus:border-[var(--accent)]/60"
              aria-label="Switch persona"
            >
              {getAllPresets().map((p) => (
                <option key={p.id} value={p.id}>{p.name} · {p.id}</option>
              ))}
            </select>
            <button onClick={muteBriefing} data-testid="mute-briefing" className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-zinc-400 hover:text-zinc-200" aria-label="Mute voice">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="m23 9-6 6M17 9l6 6" /></svg>
            </button>
            <div className="hidden font-mono text-[11px] text-zinc-500 sm:block">
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
            <ActivityFeed />
          </div>

          {/* Center — centered orb, briefing, compact chat pinned to bottom */}
          <div className="order-1 flex flex-col gap-4 lg:order-2">
            {/* Centered core */}
            <div className="flex justify-center pt-1">
              <HudFrame orbState={voiceActive ? "thinking" : orbState} readouts={readouts} uptime="99.98%" className="w-full max-w-[460px]" data-testid="deck-hud" />
            </div>

            <div>
              <div className="rounded-2xl border border-[var(--accent-deep)]/30 bg-[var(--panel)]/60 p-4 backdrop-blur">
                <div className="mb-3 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
                  <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--accent-soft)]">Briefing</span>
                </div>
                <p className="mb-3 text-sm text-zinc-200">{briefing.lead}</p>
                <ul className="space-y-1.5">
                  {briefing.items.slice(0, 4).map((it) => (
                    <li key={it.label} onClick={() => setBriefItem(it)} data-testid={`briefing-item-${it.label}`} className="flex cursor-pointer items-baseline justify-between gap-3 rounded border-b border-white/[0.04] pb-1.5 transition-colors last:border-0 hover:bg-white/[0.03]">
                      <span className={`text-[13px] ${it.urgent ? "text-[var(--accent-soft)]" : "text-zinc-400"}`}>
                        {it.urgent && <span className="mr-1.5 text-[var(--accent)]">!</span>}
                        {it.label}
                      </span>
                      <span className="shrink-0 font-mono text-[13px] text-zinc-100">
                        {it.value}
                        {it.delta && <span className="ml-1.5 text-[11px] text-emerald-400/80">{it.delta}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
                {briefing.urgent && (
                  <p className="mt-3 rounded-lg bg-[var(--accent)]/10 px-3 py-2 text-[12px] leading-5 text-[var(--accent-soft)] ring-1 ring-[var(--accent)]/20">
                    {briefing.urgent}
                  </p>
                )}
              </div>
            </div>

            {/* Compact chat pinned to the bottom */}
            <div className="mt-auto">
              <BrainChat personaName={preset.name} onSend={pulse} onVoiceActive={setVoiceActive} />
            </div>
          </div>

          {/* Right — stats (clickable) */}
          <div className="order-2 space-y-4 lg:order-3">
            <SystemStatPanel onClick={() => setModal("settings")} />
            <StatPanel title="Operations" stats={OPS_STATS} onClick={() => setModal("connections")} />
          </div>
        </div>

        {/* Automations — run any playbook from here */}
        <div className="mt-4">
          <AutomationsPanel />
        </div>
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
