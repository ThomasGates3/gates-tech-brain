"use client";

import { useState } from "react";
import { callTool } from "@/lib/ux/tools";

/** Control Center scoreboard: the Field numbers that decide Thomas's next move. */
export interface ScoreboardData {
  sent: { value: number; cap: number };
  passAwaitingApprove: number;
  approvedUnsent: number;
  core: number;
  website: number;
  inboundUnanswered: number | null;
  sequenceDue: number;
  domainWarmed: boolean;
  warmNote: string;
}

function Tile({ label, value, sub, hot, testId, href }: { label: string; value: string; sub?: string; hot?: boolean; testId: string; href: string }) {
  return (
    <a href={href} data-testid={testId} className={`block rounded-lg border p-2.5 transition-colors hover:border-[var(--accent)]/60 ${hot ? "border-[var(--accent)]/60 bg-[var(--accent)]/10" : "border-white/[0.06] bg-black/30"}`}>
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className={`mt-1 font-mono text-[22px] leading-none ${hot ? "text-[var(--accent)]" : "text-slate-100"}`}>{value}</p>
      {sub && <p className="mt-1 font-mono text-[10px] text-slate-500">{sub}</p>}
    </a>
  );
}

export function Scoreboard({ data, onChange }: { data: ScoreboardData | null; onChange?: () => void }) {
  const d = data;
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const confirmWarm = async () => {
    if (!armed) return setArmed(true);
    setBusy(true); setErr(null);
    try { await callTool("brain_set_gate", { domain_warmed: true }); onChange?.(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); setArmed(false); }
  };
  return (
    <div data-testid="scoreboard" className="rounded-xl border border-[var(--accent-deep)]/30 bg-[var(--panel)]/70 p-4 backdrop-blur">
      <a href="/leads" className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--accent-soft)] hover:text-[var(--accent)]">
        <span className="h-1 w-4 bg-[var(--accent)]" />Field scoreboard →
      </a>
      <div className="grid grid-cols-2 gap-2">
        <Tile href="/leads?status=sent" testId="sb-sent" label="Sent today" value={d ? `${d.sent.value}/${d.sent.cap}` : "—"} hot={!!d && d.sent.value >= d.sent.cap} />
        <Tile href="/leads?status=PASS" testId="sb-pass" label="PASS → approve" value={d ? String(d.passAwaitingApprove) : "—"} hot={!!d && d.passAwaitingApprove > 0} />
        <Tile href="/leads?status=approved" testId="sb-approved" label="Approved, unsent" value={d ? String(d.approvedUnsent) : "—"} hot={!!d && d.approvedUnsent > 0} />
        <Tile href="/activity" testId="sb-inbound" label="Inbound unanswered" value={d ? (d.inboundUnanswered === null ? "—" : String(d.inboundUnanswered)) : "—"} hot={!!d && (d.inboundUnanswered ?? 0) > 0} />
        <Tile href="/leads" testId="sb-lanes" label="Queue core / website" value={d ? `${d.core} / ${d.website}` : "—"} />
        <Tile href="/leads?status=sent" testId="sb-due" label="Follow-ups due" value={d ? String(d.sequenceDue) : "—"} hot={!!d && d.sequenceDue > 0} />
      </div>
      {d && (
        <div data-testid="sb-warm" className={`mt-2 rounded-md px-2.5 py-1.5 text-[11px] ${d.domainWarmed ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-200"}`}>
          <p>{d.warmNote}</p>
          {!d.domainWarmed && (
            <button onClick={confirmWarm} disabled={busy} data-testid="sb-warm-confirm" title="Thomas only. Opens sending for approved emails." className={`mt-1.5 min-h-[32px] rounded-md border px-2.5 text-[11px] font-medium ${armed ? "border-amber-300 bg-amber-300/20 text-amber-100" : "border-amber-400/40 text-amber-200 hover:bg-amber-400/10"} disabled:opacity-50`}>
              {busy ? "Saving…" : armed ? "Click again to confirm warm-up" : "Confirm warm-up"}
            </button>
          )}
          {err && <p className="mt-1 text-red-300">{err}</p>}
        </div>
      )}
    </div>
  );
}
