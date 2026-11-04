"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV } from "./nav";

/**
 * Phone navigation: a glass tab bar pinned to the bottom of the screen.
 * The active tab sits under a glowing bump that slides between tabs (transform only).
 * Pages that do not fit in four tabs live behind "More", along with the command palette.
 */

type Tab = { href: string; label: string; icon: React.ReactNode };

const I = ({ d }: { d: string }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

const ICONS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  leads: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  field: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
  content: "M4 4h16v16H4zM4 9h16M9 4v5M15 4v5M10 13l5 2.5-5 2.5z",
  more: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
};

const TABS: Tab[] = [
  { href: "/", label: "Home", icon: <I d={ICONS.home} /> },
  { href: "/leads", label: "Leads", icon: <I d={ICONS.leads} /> },
  { href: "/field", label: "Field", icon: <I d={ICONS.field} /> },
  { href: "/content", label: "Content", icon: <I d={ICONS.content} /> },
];
const TAB_HREFS: string[] = TABS.map((t) => t.href);
const MORE = NAV.filter((n) => !TAB_HREFS.includes(n.href));

const isOn = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

export function MobileTabBar() {
  const path = usePathname() ?? "/";
  const [moreOpen, setMoreOpen] = useState(false);

  // Close the sheet whenever the route changes.
  useEffect(() => {
    const t = setTimeout(() => setMoreOpen(false), 0);
    return () => clearTimeout(t);
  }, [path]);

  useEffect(() => {
    if (!moreOpen) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMoreOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [moreOpen]);

  const tabIdx = TABS.findIndex((t) => isOn(path, t.href));
  const moreActive = tabIdx === -1 && MORE.some((m) => isOn(path, m.href));
  const idx = moreOpen ? TABS.length : tabIdx === -1 ? (moreActive ? TABS.length : -1) : tabIdx;

  const openPalette = () => {
    setMoreOpen(false);
    window.dispatchEvent(new Event("brain:palette"));
  };

  return (
    <div className="lg:hidden">
      {moreOpen && (
        <button aria-label="Close menu" onClick={() => setMoreOpen(false)} className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]" style={{ animation: "fade-in-up .18s ease-out both" }} />
      )}
      {moreOpen && (
        <div
          id="tabbar-more"
          data-testid="tabbar-more"
          className="tabbar-glass fixed inset-x-3 z-50 rounded-[24px] p-3"
          style={{ bottom: "calc(92px + env(safe-area-inset-bottom))", animation: "fade-in-up .22s cubic-bezier(.25,1,.32,1) both" }}
        >
          <div className="grid grid-cols-3 gap-2">
            {MORE.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                aria-current={isOn(path, m.href) ? "page" : undefined}
                className={`flex min-h-[52px] items-center justify-center rounded-2xl border px-2 text-[13px] transition-colors active:scale-[0.98] ${isOn(path, m.href) ? "border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[var(--accent-bright)]" : "border-white/8 bg-white/[0.03] text-slate-300"}`}
              >
                {m.label}
              </Link>
            ))}
            <button onClick={openPalette} className="flex min-h-[52px] items-center justify-center gap-1.5 rounded-2xl border border-white/8 bg-white/[0.03] px-2 text-[13px] text-slate-300 active:scale-[0.98]">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              Search
            </button>
          </div>
        </div>
      )}

      <nav
        data-testid="mobile-tabbar"
        aria-label="Main"
        className="tabbar-glass fixed inset-x-3 z-50 h-[66px] rounded-[26px]"
        style={{ bottom: "calc(12px + env(safe-area-inset-bottom))" }}
      >
        {/* Glowing bump over the active tab. One element, slid by transform. */}
        {idx >= 0 && (
          <div
            aria-hidden
            className="tabbar-bump pointer-events-none absolute -top-[19px] left-0 flex w-1/5 justify-center"
            style={{ transform: `translateX(${idx * 100}%)` }}
          >
            <svg width="100%" height="22" viewBox="0 0 96 22" preserveAspectRatio="none" fill="none" className="max-w-[88px] overflow-visible">
              <path d="M0 21 C 20 21 24 2 48 2 C 72 2 76 21 96 21 L96 24 L0 24 Z" fill="var(--tabbar-bg)" />
              <path d="M0 21 C 20 21 24 2 48 2 C 72 2 76 21 96 21" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ filter: "drop-shadow(0 0 6px var(--accent-glow))" }} />
            </svg>
          </div>
        )}
        <span aria-hidden className="tabbar-underglow" />

        <ul className="relative grid h-full grid-cols-5">
          {TABS.map((t, i) => {
            const on = idx === i;
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  data-testid={`tab-${t.label.toLowerCase()}`}
                  aria-current={on ? "page" : undefined}
                  className={`tabbar-item ${on ? "is-on" : ""}`}
                >
                  {t.icon}
                  <span>{t.label}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              data-testid="tab-more"
              aria-expanded={moreOpen}
              aria-controls="tabbar-more"
              onClick={() => setMoreOpen((o) => !o)}
              className={`tabbar-item w-full ${idx === TABS.length ? "is-on" : ""}`}
            >
              <I d={ICONS.more} />
              <span>More</span>
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}
