"use client";

import { useEffect, useState } from "react";
import type { ApprovalRequest } from "@/lib/types";

/** Actions agents want to take, waiting on Thomas. Shows nothing for anyone else. */
export function ApprovalsPanel() {
  const [list, setList] = useState<ApprovalRequest[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () =>
    fetch("/api/approvals")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setList(d?.approvals ?? null))
      .catch(() => {});

  useEffect(() => { void load(); }, []);

  const decide = async (a: ApprovalRequest, decision: "approved" | "denied") => {
    setBusy(a.id); setMsg(null);
    try {
      const r = await fetch(`/api/approvals/${a.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) });
      const d = await r.json();
      if (!r.ok) setMsg(d.error ?? "That didn't go through.");
      else if (decision === "denied") setMsg(`Denied ${a.toolCall.toolName}.`);
      else setMsg(d.ok ? `Ran ${a.toolCall.toolName}.` : `${a.toolCall.toolName} failed: ${d.result?.error ?? "unknown error"}`);
    } catch {
      setMsg("That didn't go through. Check your connection and try again.");
    } finally {
      setBusy(null);
      await load();
    }
  };

  if (!list) return null;

  return (
    <section className="mb-6 rounded-xl border border-white/10 bg-black/30 p-4" data-testid="approvals-panel">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Waiting on your approval</p>
      {list.length === 0 && <p className="mt-2 text-sm text-slate-400" data-testid="approvals-empty">Nothing waiting.</p>}
      <div className="mt-3 space-y-3">
        {list.map((a) => (
          <div key={a.id} data-testid="approval-item" className="rounded-lg border border-white/[0.06] bg-black/30 p-3">
            <p className="text-sm text-slate-100">{a.toolCall.connectorId} · {a.toolCall.toolName}</p>
            <p className="mt-1 text-[12px] text-slate-400">Requested by {a.toolCall.agentId} · {new Date(a.requestedAt).toLocaleString()}</p>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-black/40 p-2 font-mono text-[12px] text-slate-300">{JSON.stringify(a.toolCall.args, null, 2)}</pre>
            <div className="mt-3 flex gap-2">
              <button onClick={() => decide(a, "approved")} disabled={!!busy} data-testid="approval-approve" className="min-h-[44px] rounded-md bg-[var(--accent)] px-4 text-[13px] font-medium text-black disabled:opacity-50">
                {busy === a.id ? "Working…" : "Approve and run"}
              </button>
              <button onClick={() => decide(a, "denied")} disabled={!!busy} data-testid="approval-deny" className="min-h-[44px] rounded-md border border-white/10 px-4 text-[13px] text-slate-200 hover:border-[var(--accent)]/50 disabled:opacity-50">
                Deny
              </button>
            </div>
          </div>
        ))}
      </div>
      {msg && <p className="mt-3 text-[12px] text-slate-300" data-testid="approvals-msg">{msg}</p>}
    </section>
  );
}
