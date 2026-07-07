"use client";

import { useMemo, useState } from "react";
import HudFrame from "@/components/hud/HudFrame";
import type { OrbState } from "@/components/hud/CoreOrb";
import { BrainChat } from "@/components/deck/BrainChat";
import { MobileConsole } from "@/components/deck/MobileConsole";
import { StatPanel, ActivityFeed, type Activity, type Stat } from "@/components/deck/Telemetry";
import { getPreset, buildBriefing } from "@/lib/persona/presets";
import { getGreeting } from "@/lib/ux/helpers";

// ── Mock telemetry (wired to /api/chat + connectors in integration pass) ────

const SYSTEM_STATS: Stat[] = [
  { label: "Model", value: "Sonnet", sub: "standard" },
  { label: "Tokens", value: "84.2k", sub: "today" },
  { label: "Spend", value: "$1.12", sub: "today" },
  { label: "Latency", value: "312", sub: "ms avg" },
];

const OPS_STATS: Stat[] = [
  { label: "Connectors", value: "5 / 6", bar: 83 },
  { label: "Tool calls", value: "47", sub: "24h" },
  { label: "Active agents", value: "3", bar: 60 },
  { label: "Approvals", value: "1", sub: "pending" },
];

const ACTIVITY: Activity[] = [
  { id: "a1", kind: "generated", target: "Q3 client status report", agent: "Comms", at: "just now" },
  { id: "a2", kind: "updated", target: "Meridian pricing SOP", because: "the Tuesday rate change", agent: "Research", at: "2m" },
  { id: "a3", kind: "spawned", target: "reconcile Vercel deploys vs. signups", agent: "Conductor", at: "4m" },
  { id: "a4", kind: "queried", target: "1,349 signups from Neon", agent: "Data", at: "6m" },
  { id: "a5", kind: "sent", target: "renewal reminder to 12 clients", agent: "Comms", at: "11m" },
  { id: "a6", kind: "connected", target: "GitHub · 6 tools online", agent: "DevOps", at: "18m" },
  { id: "a7", kind: "alert", target: "1 production deploy failed", because: "a failing build step", agent: "DevOps", at: "22m" },
];

export default function Home() {
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [voiceActive, setVoiceActive] = useState(false);
  const preset = getPreset("agency");
  const briefing = useMemo(() => buildBriefing(preset, getGreeting()), [preset]);

  const readouts = [
    { label: "CORE", value: "ONLINE", color: "#ff6a00" },
    { label: "TIER", value: "STANDARD" },
    { label: "AGENTS", value: "3 ACTIVE" },
    { label: "UPTIME", value: "99.98%" },
  ];

  const pulse = () => { setOrbState("thinking"); setTimeout(() => setOrbState("idle"), 2600); };

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans">
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
          <div className="hidden font-mono text-[11px] text-zinc-500 sm:block">
            <span className="text-[var(--accent-soft)]">{new Date().toLocaleDateString()}</span> · {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </header>

        {/* 3-column JARVIS grid: activity | core+chat | stats */}
        <div className="grid gap-4 lg:grid-cols-[290px_minmax(0,1fr)_260px]">
          {/* Left — activity */}
          <div className="order-3 lg:order-1">
            <ActivityFeed items={ACTIVITY} />
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
                    <li key={it.label} className="flex items-baseline justify-between gap-3 border-b border-white/[0.04] pb-1.5 last:border-0">
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

          {/* Right — stats */}
          <div className="order-2 space-y-4 lg:order-3">
            <StatPanel title="System" stats={SYSTEM_STATS} />
            <StatPanel title="Operations" stats={OPS_STATS} />
          </div>
        </div>
      </div>

      {/* Mobile floating orb → chat sheet */}
      <MobileConsole personaName={preset.name} greeting={getGreeting()} />
    </div>
  );
}
