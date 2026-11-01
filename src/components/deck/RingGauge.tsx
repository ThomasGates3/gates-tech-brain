"use client";

import { useId } from "react";
import { Ticker } from "./Ticker";

/**
 * Glowing ring gauge for a real value against a real limit (sends vs cap, Claude $ vs cap).
 * Shows "—" when the value isn't loaded yet. Turns amber past `warnAt` (0..1) and full blue-white at the limit.
 */
export function RingGauge({ label, value, max, format, sub, size = 92, warnAt = 0.8, testId }: {
  label: string; value: number | null; max: number | null; format?: (n: number) => string; sub?: string; size?: number; warnAt?: number; testId?: string;
}) {
  const id = useId().replace(/:/g, "");
  const r = 40, c = 2 * Math.PI * r;
  const p = value !== null && max ? Math.max(0, Math.min(1, value / max)) : 0;
  const warn = p >= warnAt && p < 1;
  return (
    <div className="flex flex-col items-center" data-testid={testId}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" width={size} height={size} className="-rotate-90">
          <defs>
            <linearGradient id={`rg${id}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={warn ? "#ffd08a" : "#eaf7ff"} />
              <stop offset=".5" stopColor={warn ? "#ffb347" : "#00e5ff"} />
              <stop offset="1" stopColor={warn ? "#ff9a3c" : "#1f6bff"} />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(148,190,230,.10)" strokeWidth="7" />
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(148,190,230,.06)" strokeWidth="1" strokeDasharray="1 5.28" transform="translate(0 0)" />
          <circle
            cx="50" cy="50" r={r} fill="none" stroke={`url(#rg${id})`} strokeWidth="7" strokeLinecap="round"
            strokeDasharray={`${c * p} ${c}`}
            className="ring-arc"
            style={{ filter: `drop-shadow(0 0 4px ${warn ? "rgba(255,170,60,.8)" : "rgba(0,229,255,.85)"})` }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="font-mono text-[17px] leading-none text-slate-50 glow-text">
              {value === null ? "—" : <Ticker value={value} format={format} />}
            </p>
            {max !== null && <p className="mt-1 font-mono text-[10px] text-[var(--mute)]">/ {format ? format(max) : max}</p>}
          </div>
        </div>
      </div>
      <p className="mt-1.5 text-[12px] text-[var(--body)]">{label}</p>
      {sub && <p className="font-mono text-[10px] text-[var(--mute)]">{sub}</p>}
    </div>
  );
}
