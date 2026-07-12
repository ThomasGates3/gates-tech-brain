"use client";

import { useEffect, useState } from "react";
import { StatPanel, type Stat } from "./Telemetry";

/** System panel with REAL usage — today's tokens/spend/latency + live model tier. */
export function SystemStatPanel({ onClick }: { onClick?: () => void }) {
  const [stats, setStats] = useState<Stat[]>([
    { label: "Model", value: "—" },
    { label: "Tokens", value: "0", sub: "today" },
    { label: "Spend", value: "$0.00", sub: "today" },
    { label: "Latency", value: "0", sub: "ms avg" },
  ]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const d = await (await fetch("/api/usage")).json();
        if (!alive) return;
        const tokens = d.tokens >= 1000 ? `${(d.tokens / 1000).toFixed(1)}k` : String(d.tokens ?? 0);
        setStats([
          { label: "Model", value: d.modelTier === "flagship" ? "Opus" : "Sonnet", sub: d.modelTier },
          { label: "Tokens", value: tokens, sub: `today · ${d.calls} calls` },
          { label: "Spend", value: `$${(d.spendUsd ?? 0).toFixed(2)}`, sub: "today" },
          { label: "Latency", value: String(d.avgLatencyMs ?? 0), sub: "ms avg" },
        ]);
      } catch {
        /* keep placeholders */
      }
    };
    load();
    const t = setInterval(load, 15000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  return <StatPanel title="System" stats={stats} onClick={onClick} />;
}
