"use client";

import { useEffect, useState } from "react";

/** Discord ping switches (Settings). */
interface N { id: string; label: string; when: string; on: boolean }

export function NotificationsPanel() {
  const [list, setList] = useState<N[] | null>(null);
  const [discord, setDiscord] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/notifications").then((r) => r.json()).then((d) => { setList(d.notifications); setDiscord(d.discord); }).catch(() => {});
  }, []);

  const post = async (key: string, body: Record<string, unknown>) => {
    setBusy(key); setMsg(null);
    try {
      const r = await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      if (d.notifications) setList(d.notifications);
      if ("test" in body) setMsg(d.ok ? "Test ping sent. Check Discord." : "Couldn't send the test ping.");
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };

  return (
    <div className="mt-6 border-t border-white/10 pt-5" data-testid="notifications-panel">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Discord pings</p>
          <p className="text-[12px] text-slate-400">{discord ? "Posts to your Discord webhook. Each one fires at most once per day (or once per reply)." : "DISCORD_WEBHOOK_URL isn't set, so pings can't be delivered."}</p>
        </div>
        <button onClick={() => post("test", { test: true })} disabled={!!busy || !discord} data-testid="notify-test" className="min-h-[44px] rounded-md border border-white/10 px-3 text-[12px] text-slate-200 hover:border-[var(--accent)]/50 disabled:opacity-40 lg:min-h-[36px]">
          {busy === "test" ? "Sending…" : "Send test ping"}
        </button>
      </div>
      <div className="space-y-2">
        {list?.map((n) => (
          <label key={n.id} data-testid={`notify-${n.id}`} className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2">
            <span className="min-w-0">
              <span className="block text-sm text-slate-100">{n.label}</span>
              <span className="block text-[12px] text-slate-500">{n.when}</span>
            </span>
            <input type="checkbox" checked={n.on} onChange={(e) => {
              const on = e.target.checked;
              setList((l) => l?.map((x) => (x.id === n.id ? { ...x, on } : x)) ?? null); // flip now, confirm with the server
              void post(n.id, { id: n.id, on }).then(() => fetch("/api/notifications").then((r) => r.json()).then((d) => setList(d.notifications)).catch(() => {}));
            }} className="h-5 w-5 shrink-0 accent-[var(--accent)]" aria-label={n.label} />
          </label>
        ))}
      </div>
      {msg && <p className="mt-2 text-[12px] text-slate-300" data-testid="notify-msg">{msg}</p>}
    </div>
  );
}
