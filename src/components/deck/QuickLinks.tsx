"use client";

import Link from "next/link";
import type { Stat } from "./Telemetry";

/** One-click jumps to every part of the system, with a live number where it helps. */
export function QuickLinks({ ops, pass, drafted }: { ops: Stat[]; pass?: number; drafted?: number }) {
  const stat = (label: string) => ops.find((o) => o.label === label)?.value ?? "—";
  const links: { href: string; label: string; sub: string; hot?: boolean }[] = [
    { href: "/leads?status=PASS", label: "Approve", sub: pass !== undefined ? `${pass} waiting` : "PASS → Thomas", hot: !!pass },
    { href: "/leads?status=drafted", label: "Nick queue", sub: drafted !== undefined ? `${drafted} drafted` : "audit drafts" },
    { href: "/field", label: "Field", sub: "one lead at a time" },
    { href: "/automations", label: "Automations", sub: "draft-only runs" },
    { href: "/operations?tab=agents", label: "Agents", sub: `${stat("Active agents")} active` },
    { href: "/operations", label: "Connections", sub: `${stat("Connectors live")} live` },
    { href: "/operations?tab=access", label: "API keys", sub: `${stat("API keys")} active` },
    { href: "/settings", label: "Settings", sub: "model · voice" },
  ];
  return (
    <div data-testid="quick-links" className="rounded-xl border border-[var(--accent-deep)]/30 bg-[var(--panel)]/70 p-3 backdrop-blur">
      <div className="mb-2 flex items-center gap-2">
        <span className="h-1 w-4 bg-[var(--accent)]" />
        <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--accent-soft)]">Go to</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {links.map((l) => (
          <Link key={l.label} href={l.href} data-testid={`ql-${l.label.toLowerCase().replace(/\s+/g, "-")}`} className={`rounded-lg border px-2.5 py-1.5 transition-colors hover:border-[var(--accent)]/50 ${l.hot ? "border-[var(--accent)]/50 bg-[var(--accent)]/10" : "border-white/[0.06] bg-black/30"}`}>
            <p className="text-[13px] text-slate-100">{l.label}</p>
            <p className={`text-[11px] ${l.hot ? "text-[var(--accent-soft)]" : "text-slate-500"}`}>{l.sub}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
