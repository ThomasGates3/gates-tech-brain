"use client";

import { useEffect, useState } from "react";

/**
 * Tiny global toast: call toast("Approved", { action: { label: "Undo", run } }) from anywhere.
 * One <Toaster /> lives in the root layout. No dependency, respects reduced motion via CSS.
 */
export interface ToastOpts { tone?: "ok" | "error" | "info"; ms?: number; action?: { label: string; run: () => void } }
interface Item extends ToastOpts { id: number; text: string }

const EVT = "brain:toast";
let seq = 0;

export function toast(text: string, opts: ToastOpts = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<Item>(EVT, { detail: { id: ++seq, text, ...opts } }));
}

const TONE: Record<string, string> = {
  ok: "border-sky-300/30 text-slate-100",
  info: "border-white/15 text-slate-200",
  error: "border-red-400/40 text-red-200",
};

export function Toaster() {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const it = (e as CustomEvent<Item>).detail;
      setItems((xs) => [...xs.slice(-2), it]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== it.id)), it.ms ?? 4000);
    };
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  if (!items.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+10px)] z-[90] flex flex-col items-center gap-2 px-4 lg:top-auto lg:bottom-6" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} data-testid="toast" role={t.tone === "error" ? "alert" : "status"} className={`toast-in pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border bg-[#0a1224]/95 px-4 py-3 text-[15px] shadow-[0_12px_40px_-12px_rgba(0,0,0,.8)] backdrop-blur ${TONE[t.tone ?? "ok"]}`}>
          <span className="min-w-0 flex-1">{t.text}</span>
          {t.action && (
            <button
              data-testid="toast-action"
              onClick={() => { t.action!.run(); setItems((xs) => xs.filter((x) => x.id !== t.id)); }}
              className="shrink-0 rounded-md px-2 py-1 font-medium text-[var(--accent-soft)] hover:bg-white/5"
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
