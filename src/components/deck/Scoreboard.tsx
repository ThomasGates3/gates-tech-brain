"use client";

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

function Tile({ label, value, sub, hot, testId }: { label: string; value: string; sub?: string; hot?: boolean; testId: string }) {
  return (
    <div data-testid={testId} className={`rounded-lg border p-2.5 ${hot ? "border-[var(--accent)]/60 bg-[var(--accent)]/10" : "border-white/[0.06] bg-black/30"}`}>
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className={`mt-1 font-mono text-[22px] leading-none ${hot ? "text-[var(--accent)]" : "text-slate-100"}`}>{value}</p>
      {sub && <p className="mt-1 font-mono text-[10px] text-slate-500">{sub}</p>}
    </div>
  );
}

export function Scoreboard({ data }: { data: ScoreboardData | null }) {
  const d = data;
  return (
    <a href="/field" data-testid="scoreboard" className="block rounded-xl border border-[var(--accent-deep)]/30 bg-[var(--panel)]/70 p-4 backdrop-blur transition-colors hover:border-[var(--accent)]/40">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-1 w-4 bg-[var(--accent)]" />
        <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--accent-soft)]">Field scoreboard</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Tile testId="sb-sent" label="Sent today" value={d ? `${d.sent.value}/${d.sent.cap}` : "—"} hot={!!d && d.sent.value >= d.sent.cap} />
        <Tile testId="sb-pass" label="PASS → approve" value={d ? String(d.passAwaitingApprove) : "—"} hot={!!d && d.passAwaitingApprove > 0} />
        <Tile testId="sb-approved" label="Approved, unsent" value={d ? String(d.approvedUnsent) : "—"} hot={!!d && d.approvedUnsent > 0} />
        <Tile testId="sb-inbound" label="Inbound unanswered" value={d ? (d.inboundUnanswered === null ? "—" : String(d.inboundUnanswered)) : "—"} hot={!!d && (d.inboundUnanswered ?? 0) > 0} />
        <Tile testId="sb-lanes" label="Queue core / website" value={d ? `${d.core} / ${d.website}` : "—"} />
        <Tile testId="sb-due" label="Follow-ups due" value={d ? String(d.sequenceDue) : "—"} hot={!!d && d.sequenceDue > 0} />
      </div>
      {d && (
        <p data-testid="sb-warm" className={`mt-2 rounded-md px-2.5 py-1.5 text-[11px] ${d.domainWarmed ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-200"}`}>
          {d.domainWarmed ? "Domain warmed" : "Domain not warmed"} · {d.warmNote}
        </p>
      )}
    </a>
  );
}
