"use client";

import { useState } from "react";
import { callTool } from "@/lib/ux/tools";
import { LeadActions } from "@/components/deck/LeadActions";
import type { Lead } from "@/lib/field/leads";

/** The open folder's leads, with the same per-lead buttons as /leads plus one bulk move. */
export function FolderPanel({ title, kind, leads, warmed, onDone, onClose }: {
  title: string;
  kind: "new" | "approved" | "sent" | "followup";
  leads: Lead[];
  warmed: boolean;
  onDone: () => void;
  onClose: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Bulk: approve every PASS in New Leads, or send every approved email (needs warm-up).
  const bulk = kind === "new"
    ? { targets: leads.filter((l) => l.email1_status === "PASS"), verb: "Approve", tool: "brain_approve", args: {} }
    : kind === "approved"
      ? { targets: leads, verb: "Send", tool: "brain_approve_send", args: { confirm: true } }
      : null;
  const bulkBlocked = kind === "approved" && !warmed ? "Warm-up not confirmed: no sends" : undefined;

  const runBulk = async () => {
    if (!bulk) return;
    if (!armed) return setArmed(true);
    setArmed(false); setMsg(null);
    let ok = 0;
    for (const [i, l] of bulk.targets.entries()) {
      setProgress(`${bulk.verb === "Send" ? "Sending" : "Approving"} ${i + 1}/${bulk.targets.length}…`);
      try {
        await callTool(bulk.tool, { contact_id: l.contact_id, ...bulk.args });
        ok++;
      } catch (e) {
        // Stop on the first refusal (cap reached, lint, gate): the rest would fail the same way.
        setMsg(`${l.business}: ${e instanceof Error ? e.message : String(e)}`);
        break;
      }
    }
    setProgress(null);
    setMsg((m) => `${bulk.verb === "Send" ? "Sent" : "Approved"} ${ok} of ${bulk.targets.length}.${m ? ` Stopped at ${m}` : ""}`);
    onDone();
  };

  return (
    <div data-testid={`folder-panel-${kind}`} className="mt-4 rounded-lg border border-white/[0.06] bg-black/30 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--accent-soft)]">{title} · {leads.length}</p>
        <div className="flex items-center gap-2">
          {bulk && bulk.targets.length > 0 && (
            <button
              data-testid={`bulk-${kind}`}
              onClick={runBulk}
              disabled={!!progress || !!bulkBlocked}
              title={bulkBlocked}
              className={`min-h-[30px] rounded-md px-2.5 text-[11px] font-medium disabled:opacity-40 ${armed ? "border border-amber-300 bg-amber-300/20 text-amber-100" : "bg-[var(--accent)] text-black hover:bg-[var(--accent-bright)]"}`}
            >
              {progress ?? (armed ? `Confirm: ${bulk.verb.toLowerCase()} ${bulk.targets.length}` : `${bulk.verb} all ${kind === "new" ? "PASS " : ""}(${bulk.targets.length})`)}
            </button>
          )}
          <button onClick={onClose} aria-label="Close panel" className="grid h-[30px] w-[30px] place-items-center rounded-md text-slate-500 hover:bg-white/5 hover:text-slate-200">✕</button>
        </div>
      </div>
      {msg && <p className="mb-2 text-[11px] text-slate-300" data-testid="folder-panel-msg">{msg}</p>}
      <ul className="max-h-[240px] space-y-2 overflow-y-auto pr-1">
        {leads.map((l) => (
          <li key={l.contact_id} className="rounded-md border border-white/[0.04] px-2 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <a href={`/leads?open=${encodeURIComponent(l.contact_id)}`} className="min-w-0 truncate text-[13px] text-slate-200 hover:text-[var(--accent)]" title="Read the email">
                {l.business}<span className="ml-1.5 font-mono text-[10px] text-slate-500">{l.lane}</span>
              </a>
              <span className="shrink-0 text-[11px] text-[var(--accent-soft)]">{l.next_action}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <LeadActions lead={l} warmed={warmed} onDone={onDone} />
            </div>
          </li>
        ))}
        {!leads.length && <li className="text-[12px] text-slate-500">Empty.</li>}
      </ul>
    </div>
  );
}
