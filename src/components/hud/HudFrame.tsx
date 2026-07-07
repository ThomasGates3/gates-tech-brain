"use client";

import CoreOrb, { type OrbState } from "./CoreOrb";

interface TelemetryReadout {
  label: string;
  value: string;
  color?: string;
}

interface HudFrameProps {
  orbState?: OrbState;
  readouts?: TelemetryReadout[];
  uptime?: string;
  className?: string;
  "data-testid"?: string;
}

const DEFAULT_READOUTS: TelemetryReadout[] = [
  { label: "CONDUCTOR",  value: "OPUS 4.8",    color: "#c4b5fd" },
  { label: "TIER",       value: "FLAGSHIP",    color: "#ff7a17" },
  { label: "CONNECTORS", value: "6 ACTIVE",    color: "#22c55e" },
  { label: "MEMORY",     value: "pgvector",    color: "#a0c3ec" },
];

/** Telemetry overlay frame rendered around the main orb area */
export default function HudFrame({
  orbState = "idle",
  readouts = DEFAULT_READOUTS,
  uptime = "00:00:00",
  className = "",
  "data-testid": testId = "hud-frame",
}: HudFrameProps) {
  return (
    <div
      data-testid={testId}
      className={`relative pointer-events-none select-none min-h-[240px] h-full ${className}`}
    >
      {/* Centered reactive core */}
      <div className="absolute inset-0 grid place-items-center">
        <CoreOrb state={orbState} className="h-44 w-44" />
      </div>

      {/* Top-left corner bracket */}
      <div className="absolute top-0 left-0 w-8 h-8 border-t border-l"
           style={{ borderColor: "var(--hairline)" }} />
      {/* Top-right corner bracket */}
      <div className="absolute top-0 right-0 w-8 h-8 border-t border-r"
           style={{ borderColor: "var(--hairline)" }} />
      {/* Bottom-left corner bracket */}
      <div className="absolute bottom-0 left-0 w-8 h-8 border-b border-l"
           style={{ borderColor: "var(--hairline)" }} />
      {/* Bottom-right corner bracket */}
      <div className="absolute bottom-0 right-0 w-8 h-8 border-b border-r"
           style={{ borderColor: "var(--hairline)" }} />

      {/* Top telemetry bar */}
      <div className="absolute top-3 left-10 right-10 flex items-center justify-between">
        <span className="eyebrow" style={{ fontSize: 10 }}>AI BRAIN // CMD DECK</span>
        <span className="eyebrow" style={{ fontSize: 10, color: "var(--accent-sunset)" }}>
          STATE: {orbState.toUpperCase()}
        </span>
      </div>

      {/* Left side readouts */}
      <div className="absolute left-3 top-12 flex flex-col gap-3">
        {readouts.slice(0, 2).map((r) => (
          <div key={r.label} className="flex flex-col">
            <span className="eyebrow" style={{ fontSize: 9, color: "var(--mute)" }}>{r.label}</span>
            <span className="font-mono text-xs" style={{ color: r.color ?? "var(--ink)", letterSpacing: "0.05em" }}>
              {r.value}
            </span>
          </div>
        ))}
      </div>

      {/* Right side readouts */}
      <div className="absolute right-3 top-12 flex flex-col gap-3 items-end">
        {readouts.slice(2, 4).map((r) => (
          <div key={r.label} className="flex flex-col items-end">
            <span className="eyebrow" style={{ fontSize: 9, color: "var(--mute)" }}>{r.label}</span>
            <span className="font-mono text-xs" style={{ color: r.color ?? "var(--ink)", letterSpacing: "0.05em" }}>
              {r.value}
            </span>
          </div>
        ))}
      </div>

      {/* Bottom uptime */}
      <div className="absolute bottom-3 left-10 right-10 flex justify-between items-center">
        <span className="eyebrow" style={{ fontSize: 9 }}>UPTIME {uptime}</span>
        <div className="flex items-center gap-1.5">
          <div className={`status-dot ${orbState === "error" ? "status-dot-error" : orbState === "idle" ? "status-dot-idle" : "status-dot-active"}`} />
          <span className="eyebrow" style={{ fontSize: 9 }}>SYSTEM NOMINAL</span>
        </div>
      </div>
    </div>
  );
}
