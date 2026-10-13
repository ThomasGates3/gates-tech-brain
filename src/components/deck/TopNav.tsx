"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cancelSpeech } from "@/lib/ux/speak";

/** Site-wide navigation for the Control Center and its pages. */
export const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/leads", label: "Leads" },
  { href: "/roadmap", label: "Roadmap" },
  { href: "/mission", label: "Mission" },
  { href: "/field", label: "Field" },
  { href: "/activity", label: "Activity" },
  { href: "/automations", label: "Automations" },
  { href: "/operations", label: "Operations" },
  { href: "/settings", label: "Settings" },
] as const;

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 30000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, []);
  if (!now) return null;
  return <span className="hidden font-mono text-[11px] text-slate-500 xl:inline">{now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} · {now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>;
}

/** Count of Mission Control tasks waiting on Thomas; refreshed every minute. */
function useWaiting() {
  const [waiting, setWaiting] = useState(0);
  useEffect(() => {
    const load = () => fetch("/api/mission/badge").then((r) => r.json()).then((d) => setWaiting(Number(d.waiting) || 0)).catch(() => {});
    const first = setTimeout(load, 0);
    const t = setInterval(load, 60000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, []);
  return waiting;
}

export function TopNav() {
  const path = usePathname();
  const waiting = useWaiting();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const mute = () => { try { localStorage.setItem("mute_briefing", "1"); } catch { /* ignore */ } cancelSpeech(); };
  return (
    <nav data-testid="top-nav" className="sticky top-0 z-30 border-b border-[var(--accent-deep)]/30 bg-black/80 backdrop-blur">
      <div className="flex h-14 w-full items-center gap-3 px-4 lg:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Gates Tech Brain home">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--accent)]" style={{ boxShadow: "0 0 10px var(--accent)" }} />
          <span className="hidden font-mono text-[11px] uppercase tracking-[0.3em] text-slate-300 sm:inline">Gates Brain</span>
          <span className="hidden text-[12px] text-[var(--accent)] md:inline">NOVA online</span>
        </Link>
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none] sm:justify-center">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              data-testid={`nav-${n.label.toLowerCase()}`}
              aria-current={active(n.href) ? "page" : undefined}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] transition-colors ${active(n.href) ? "bg-[var(--accent)] font-medium text-black" : "text-slate-400 hover:bg-white/5 hover:text-slate-100"}`}
            >
              {n.label}
              {n.href === "/mission" && waiting > 0 && (
                <span data-testid="nav-mission-badge" aria-label={`${waiting} ${waiting === 1 ? "task" : "tasks"} waiting on Thomas`} className="ml-1.5 inline-grid min-w-[18px] place-items-center rounded-full bg-[#ff7a45] px-1 text-[10px] font-semibold leading-[18px] text-black">{waiting}</span>
              )}
            </Link>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Clock />
          <button onClick={mute} aria-label="Mute voice" title="Mute the spoken briefing" className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-slate-400 hover:text-slate-200">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="m23 9-6 6M17 9l6 6" /></svg>
          </button>
          <a href="/api/auth/logout" className="hidden rounded-lg px-2 py-1.5 text-[12px] text-slate-500 hover:text-slate-200 md:inline">Sign out</a>
        </div>
      </div>
    </nav>
  );
}
