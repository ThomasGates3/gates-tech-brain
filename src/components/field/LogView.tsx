"use client";

import { useCallback, useEffect, useState } from "react";
import type { SendLogEntry, Suppression } from "@/lib/field/types";
import { Button, Caption } from "./ui";

export function LogView() {
  const [log, setLog] = useState<SendLogEntry[] | null>(null);
  const [sup, setSup] = useState<Suppression[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState<"opt_out" | "bounce" | "manual">("opt_out");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/field/log", { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setLog(d.log);
      setSup(d.suppressions);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load();
  }, [load]);

  const suppress = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/field/log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, reason }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return setErr(d.error ?? `HTTP ${res.status}`);
    setEmail("");
    void load();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]" data-testid="log-view">
      <section>
        <Caption className="mb-3">Send log</Caption>
        {err && <p className="mb-3 text-[13px] text-red-400" role="alert">{err}</p>}
        {log === null ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : log.length === 0 ? (
          <p className="text-sm text-slate-500">No sends yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                <tr className="border-b border-white/10">
                  <th className="px-3 py-2 font-normal">Sent at</th>
                  <th className="px-3 py-2 font-normal">Recipient</th>
                  <th className="px-3 py-2 font-normal">Subject</th>
                  <th className="px-3 py-2 font-normal">AgentMail id</th>
                  <th className="px-3 py-2 font-normal">Supp.</th>
                  <th className="px-3 py-2 font-normal">Operator</th>
                </tr>
              </thead>
              <tbody>
                {log.map((r) => (
                  <tr key={r.id} className="border-b border-white/5 last:border-0" data-testid="log-row">
                    <td className="whitespace-nowrap px-3 py-2 text-slate-400">{new Date(r.sentAt).toLocaleString()}</td>
                    <td className="px-3 py-2 text-slate-200">
                      {r.recipient}
                      <span className="block text-[11px] text-slate-500">{r.contactName}</span>
                    </td>
                    <td className="px-3 py-2 text-slate-300">{r.subject}</td>
                    <td className="max-w-[180px] truncate px-3 py-2 font-mono text-[11px] text-slate-500" title={r.agentmailMessageId}>{r.agentmailMessageId}</td>
                    <td className="px-3 py-2 text-slate-300">{r.suppressed ? "yes" : "no"}</td>
                    <td className="px-3 py-2 capitalize text-slate-300">{r.operator}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <Caption className="mb-3">Suppression list</Caption>
        <form onSubmit={suppress} className="mb-3 flex flex-col gap-2 rounded-2xl border border-white/10 bg-[#08101f] p-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@business.com"
            data-testid="suppress-email"
            className="min-h-[44px] rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-[#00e5ff]/60"
          />
          <div className="flex gap-2">
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as typeof reason)}
              className="min-h-[44px] flex-1 rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-slate-100"
            >
              <option value="opt_out">Replied “no” / opt-out</option>
              <option value="bounce">Bounced</option>
              <option value="manual">Manual</option>
            </select>
            <Button type="submit" variant="ghost">Suppress</Button>
          </div>
        </form>
        <ul className="max-h-[420px] divide-y divide-white/5 overflow-auto rounded-2xl border border-white/10 text-[13px]">
          {sup.length === 0 && <li className="p-3 text-slate-500">Empty.</li>}
          {sup.map((s) => (
            <li key={s.email} className="flex items-center justify-between gap-2 p-3">
              <span className="truncate text-slate-200">{s.email}</span>
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-slate-500">{s.reason.replace("_", " ")}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
