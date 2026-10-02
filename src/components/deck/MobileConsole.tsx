"use client";

import { useState } from "react";
import CoreOrb, { type OrbState } from "@/components/hud/CoreOrb";
import { BrainChat } from "@/components/deck/BrainChat";

/**
 * Mobile experience: a floating circular orb (like a live-chat bubble).
 * Tap → opens a full-screen chat sheet. The orb scales/ripples whenever
 * you talk or the brain talks back (driven by VoiceControl.onActive).
 */
export function MobileConsole({ personaName, greeting }: { personaName: string; greeting: string }) {
  const [open, setOpen] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [orbState, setOrbState] = useState<OrbState>("idle");

  const active = voiceActive || orbState === "thinking";

  return (
    <div className="lg:hidden">
      {/* Floating launcher: the leads board is the phone's main screen; tap the orb to talk */}
      {!open && (
        <button
          data-testid="mobile-orb"
          aria-label={`${greeting}. Talk to ${personaName}`}
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 grid h-16 w-16 place-items-center rounded-full bg-black/70 ring-1 ring-[var(--accent)]/40 backdrop-blur transition-transform active:scale-95"
        >
          {active && <span className="pointer-events-none absolute inset-0 rounded-full border border-[var(--accent)]/40" style={{ animation: "orb-ripple 1.4s ease-out infinite" }} />}
          <CoreOrb state={active ? "thinking" : "idle"} className="h-14 w-14" />
        </button>
      )}

      {/* Full-screen chat sheet */}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-xl" data-testid="mobile-sheet">
          <div className="flex items-center justify-between border-b border-[var(--accent-deep)]/30 px-4 py-3">
            <div className="flex items-center gap-3">
              <div style={{ transform: `scale(${active ? 1.15 : 1})`, transition: "transform .2s" }}>
                <CoreOrb state={active ? "thinking" : "idle"} className="h-10 w-10" />
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate-500">AI Brain</p>
                <p className="text-sm font-semibold text-[var(--accent)]">{personaName}</p>
              </div>
            </div>
            <button
              data-testid="mobile-close"
              onClick={() => setOpen(false)}
              className="grid h-11 w-11 place-items-center rounded-full text-slate-400 hover:bg-white/5"
              aria-label="Close"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>

          <div className="flex-1 overflow-hidden p-3">
            <BrainChat
              personaName={personaName}
              className="h-full"
              onSend={() => { setOrbState("thinking"); setTimeout(() => setOrbState("idle"), 2600); }}
              onVoiceActive={setVoiceActive}
              data-testid="mobile-chat"
            />
          </div>
        </div>
      )}
    </div>
  );
}
