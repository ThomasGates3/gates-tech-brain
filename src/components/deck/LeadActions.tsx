"use client";

import { useState } from "react";
import { callTool } from "@/lib/ux/tools";

/** The next-step buttons for one lead. Every click goes through the Brain tools (same gates as the bots). */
export interface ActionLead {
  contact_id: string; business: string; source: string; tier: string; email1_status: string; lint_issues: number;
  duplicate_of: string[]; approved: boolean; booked?: boolean; paid_offer?: string | null;
}

const OFFER_LABEL: Record<string, string> = { core: "Core", website: "Website redesign", reactivation: "Lead reactivation" };

const btn = "min-h-[32px] rounded-md px-2.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
const primary = `${btn} bg-[var(--accent)] text-black hover:bg-[var(--accent-bright)]`;
const quiet = `${btn} border border-white/10 text-slate-300 hover:border-[var(--accent)]/50`;
const danger = `${btn} border border-red-500/30 text-red-300 hover:bg-red-500/10`;

export function LeadActions({ lead, warmed, onDone }: { lead: ActionLead; warmed: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<"REVISE" | "KILL" | null>(null);
  const [note, setNote] = useState("");
  const [confirmSend, setConfirmSend] = useState(false);
  const [offer, setOffer] = useState("");
  const id = lead.contact_id;

  const run = async (label: string, name: string, args: Record<string, unknown>) => {
    setBusy(label);
    setErr(null);
    try {
      await callTool(name, { agent: label.startsWith("nick") ? "nick" : undefined, contact_id: id, ...args });
      setNoteFor(null);
      setNote("");
      setConfirmSend(false);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const B = (label: string, text: string, cls: string, name: string, args: Record<string, unknown> = {}, disabled?: string) => (
    <button key={label} data-testid={`act-${label}-${id}`} className={cls} disabled={!!busy || !!disabled} title={disabled} onClick={(e) => { e.preventDefault(); void run(label, name, args); }}>
      {busy === label ? "…" : text}
    </button>
  );

  const s = lead.email1_status;
  const buttons: React.ReactNode[] = [];
  if (lead.duplicate_of.length && s !== "sent")
    buttons.push(
      <button key="merge" data-testid={`act-merge-${id}`} className={primary} disabled={!!busy} onClick={async (e) => {
        e.preventDefault(); setBusy("merge"); setErr(null);
        try { for (const drop of lead.duplicate_of) await callTool("brain_merge_contacts", { keep_id: id, drop_id: drop }); onDone(); }
        catch (x) { setErr(x instanceof Error ? x.message : String(x)); } finally { setBusy(null); }
      }}>{busy === "merge" ? "…" : `Merge ${lead.duplicate_of.length} duplicate${lead.duplicate_of.length > 1 ? "s" : ""}`}</button>
    );
  if (s === "undrafted") {
    buttons.push(B("tpl", "Template draft", quiet, "brain_set_draft", { generate: "template" }));
    buttons.push(B("claude", "Claude draft", primary, "brain_set_draft", { generate: "sonnet" }));
  }
  if (s === "drafted" || s === "atNick") {
    buttons.push(B("nick-pass", "Nick PASS", primary, "brain_set_nick_status", { verdict: "PASS", note: "" }, lead.lint_issues ? "Fix the copy lint first" : undefined));
    buttons.push(<button key="rev" data-testid={`act-revise-${id}`} className={quiet} disabled={!!busy} onClick={(e) => { e.preventDefault(); setNoteFor("REVISE"); }}>REVISE</button>);
    buttons.push(<button key="kill" data-testid={`act-kill-${id}`} className={danger} disabled={!!busy} onClick={(e) => { e.preventDefault(); setNoteFor("KILL"); }}>KILL</button>);
    buttons.push(B("redraft", "Redraft", quiet, "brain_set_draft", { generate: "sonnet" }));
  }
  if (s === "PASS") buttons.push(B("approve", "Approve", primary, "brain_approve", {}));
  if (s === "approved") {
    if (!warmed) buttons.push(<button key="send" className={primary} disabled title="Warm-up not confirmed: no sends">Send</button>);
    else if (!confirmSend) buttons.push(<button key="send" data-testid={`act-send-${id}`} className={primary} disabled={!!busy} onClick={(e) => { e.preventDefault(); setConfirmSend(true); }}>Send…</button>);
    else buttons.push(B("send", "Confirm send", danger, "brain_approve_send", { confirm: true }));
  }
  if (["undrafted", "drafted", "atNick", "PASS", "approved"].includes(s)) buttons.push(B("hold", "Hold", quiet, "brain_hold", { hold: true }));
  // Money roadmap flags (Booked: Thomas or Lisa; Paid: Thomas). The server enforces who.
  if (s === "sent" && !lead.booked && !lead.paid_offer) buttons.push(B("booked", "Booked call", quiet, "brain_mark_booked", {}));
  if (s === "sent" && !lead.paid_offer)
    buttons.push(
      <span key="paid" className="flex gap-1">
        <select value={offer} onChange={(e) => setOffer(e.target.value)} data-testid={`act-paid-offer-${id}`} aria-label="Offer paid for" className="min-h-[32px] rounded-md border border-white/10 bg-black/40 px-1.5 text-[11px] text-slate-200">
          <option value="">Paid for…</option>
          {Object.entries(OFFER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {B("paid", "Paid", primary, "brain_mark_paid", { offer }, offer ? undefined : "Pick the offer first")}
      </span>
    );
  if (lead.paid_offer) buttons.push(<span key="paid-badge" data-testid={`lead-paid-${id}`} className="rounded-md bg-emerald-400/15 px-2 py-1 text-[11px] font-medium text-emerald-300">Paid: {OFFER_LABEL[lead.paid_offer] ?? lead.paid_offer}</span>);
  else if (lead.booked) buttons.push(<span key="booked-badge" data-testid={`lead-booked-${id}`} className="rounded-md bg-sky-400/15 px-2 py-1 text-[11px] font-medium text-sky-300">Call booked</span>);
  if (s === "hold" && lead.tier !== "Soft") buttons.push(B("release", "Release", quiet, "brain_hold", { hold: false }));

  return (
    <div className="space-y-1.5" onClick={(e) => e.preventDefault()}>
      <div className="flex flex-wrap gap-1.5">{buttons}</div>
      {noteFor && (
        <div className="flex gap-1.5">
          <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder={`${noteFor} note`} data-testid={`act-note-${id}`} className="min-h-[32px] min-w-0 flex-1 rounded-md border border-white/10 bg-black/40 px-2 text-[12px] text-slate-100 outline-none" />
          {B(`nick-${noteFor.toLowerCase()}`, `Save ${noteFor}`, noteFor === "KILL" ? danger : primary, "brain_set_nick_status", { verdict: noteFor, note })}
          <button className={quiet} onClick={(e) => { e.preventDefault(); setNoteFor(null); }}>Cancel</button>
        </div>
      )}
      {err && <p className="text-[11px] text-red-300" data-testid={`act-err-${id}`}>{err}</p>}
    </div>
  );
}
