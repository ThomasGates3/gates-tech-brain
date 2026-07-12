"use client";

import { useEffect, useState } from "react";
import CoreOrb from "@/components/hud/CoreOrb";

const LINES = [
  "Initializing neural core…",
  "Establishing secure link…",
  "Bringing connectors online…",
  "Loading knowledge & memory…",
  "{name} ready.",
];

/** Cinematic boot overlay — plays once per session. */
export function BootSequence({ name, accent, onDone }: { name: string; accent: string; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    LINES.forEach((_, i) => timers.push(setTimeout(() => setStep(i + 1), 380 * (i + 1))));
    timers.push(setTimeout(() => setLeaving(true), 380 * LINES.length + 500));
    timers.push(setTimeout(onDone, 380 * LINES.length + 1100));
    return () => timers.forEach(clearTimeout);
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black transition-opacity duration-500"
      style={{ opacity: leaving ? 0 : 1 }}
      data-testid="boot-sequence"
    >
      <div className="pointer-events-none fixed inset-0" style={{ background: `radial-gradient(600px 400px at 50% 45%, ${accent}20, transparent 70%)` }} />
      <CoreOrb state="thinking" className="h-40 w-40" />
      <div className="mt-10 h-24 w-[280px] font-mono text-[12px] uppercase tracking-[0.2em]">
        {LINES.slice(0, step).map((l, i) => (
          <p key={i} className="leading-6" style={{ color: i === step - 1 ? accent : "#5a5a5a" }}>
            <span className="text-zinc-700">›</span> {l.replace("{name}", name)}
          </p>
        ))}
      </div>
    </div>
  );
}
