"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cancelSpeech } from "@/lib/ux/speak";
import { MobileTabBar } from "./MobileTabBar";
import { NAV } from "./nav";

export { NAV } from "./nav";

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

/**
 * Desktop: a lamp that hangs from the top edge of the nav and pours a cone of light on the active
 * page. One element, measured from the active link and moved with transform only.
 */
function useLamp(path: string) {
  const row = useRef<HTMLDivElement>(null);
  const [lamp, setLamp] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = row.current?.querySelector<HTMLElement>('[aria-current="page"]');
      setLamp(el ? { x: el.offsetLeft, w: el.offsetWidth } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (row.current) ro.observe(row.current);
    return () => ro.disconnect();
  }, [path]);
  return { row, lamp };
}

export function TopNav() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const mute = () => { try { localStorage.setItem("mute_briefing", "1"); } catch { /* ignore */ } cancelSpeech(); };
  const { row, lamp } = useLamp(path);
  return (
    <>
    <nav data-testid="top-nav" className="sticky top-0 z-30 border-b border-[var(--accent-deep)]/30 bg-black/80 backdrop-blur">
      <div className="flex h-14 w-full items-center gap-3 px-4 lg:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Gates Tech Brain home">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--accent)]" style={{ boxShadow: "0 0 10px var(--accent)" }} />
          <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-slate-300">Gates Brain</span>
          <span className="hidden text-[12px] text-[var(--accent)] md:inline">NOVA online</span>
        </Link>
        {/* Phones use the bottom tab bar instead of this row. */}
        <div ref={row} className="relative hidden min-w-0 flex-1 self-stretch lg:flex lg:justify-center">
          <div className="relative flex h-full items-center gap-1">
            {lamp && (
              <span
                aria-hidden
                data-testid="nav-lamp"
                className="nav-lamp"
                style={{ transform: `translateX(${lamp.x}px)`, width: lamp.w }}
              />
            )}
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                data-testid={`nav-${n.label.toLowerCase()}`}
                aria-current={active(n.href) ? "page" : undefined}
                className={`relative shrink-0 rounded-full px-3 py-1.5 text-[13px] transition-colors duration-200 ${active(n.href) ? "font-medium text-[var(--accent-bright)] [text-shadow:0_0_12px_var(--accent-glow)]" : "text-slate-400 hover:bg-white/5 hover:text-slate-100"}`}
              >
                {n.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Clock />
          <button onClick={mute} aria-label="Mute voice" title="Mute the spoken briefing" className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-slate-400 hover:text-slate-200">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="m23 9-6 6M17 9l6 6" /></svg>
          </button>
          <a href="/api/auth/logout" className="hidden rounded-lg px-2 py-1.5 text-[12px] text-slate-500 hover:text-slate-200 md:inline">Sign out</a>
        </div>
      </div>
    </nav>
    <MobileTabBar />
    </>
  );
}
