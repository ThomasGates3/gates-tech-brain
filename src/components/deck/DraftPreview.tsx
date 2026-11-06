"use client";

import { useEffect, useState } from "react";
import { callTool } from "@/lib/ux/tools";

/** The email as it would go out: subject, body, footer, plus Nick's verdict and copy-lint issues. */
interface Draft {
  name: string; email: string; contact_name: string | null; subject: string; body: string; stage: string; draft_source: string | null;
  nick: { verdict: string | null; note: string | null; on_current_draft: boolean }; approved: boolean; approved_by: string | null;
  lint: { rule: string; match: string }[]; gap: string; site_url: string | null; footer: string | null; email_n: number;
}

const SOURCE: Record<string, string> = { claude: "Claude", template: "template", manual: "written by a bot or by hand", notion: "Notion", csv: "CSV" };

export function DraftPreview({ contactId, version, onSaved }: { contactId: string; version: number; onSaved?: () => void }) {
  const [d, setD] = useState<Draft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const startEdit = () => { if (d) { setSubject(d.subject); setBody(d.body); setSaveErr(null); setEditing(true); } };
  const save = async () => {
    setSaving(true); setSaveErr(null);
    try {
      const r = await callTool<Draft>("brain_set_draft", { contact_id: contactId, subject, body });
      setD(r); setEditing(false); onSaved?.();
    } catch (e) { setSaveErr(e instanceof Error ? e.message : String(e)); } finally { setSaving(false); }
  };

  useEffect(() => {
    let alive = true;
    callTool<Draft>("brain_get_draft", { contact_id: contactId })
      .then((r) => alive && (setD(r), setErr(null)))
      .catch((e) => alive && setErr(e instanceof Error ? e.message : String(e)));
    return () => { alive = false; };
  }, [contactId, version]);

  if (err) return <p className="text-[14px] text-red-300">{err}</p>;
  if (!d) return <p className="text-[14px] text-slate-500">Loading the email…</p>;
  if (!d.body) return <p className="text-[15px] text-slate-400" data-testid="draft-empty">No Email 1 draft yet. Use Template draft or Claude draft to write one.</p>;

  return (
    <div data-testid={`draft-${contactId}`} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="rounded-lg border border-white/10 bg-black/50 p-3">
        <p className="mb-2 border-b border-white/10 pb-2 text-[14px] text-slate-400">
          To <span className="text-slate-200">{d.contact_name ? `${d.contact_name} <${d.email}>` : d.email}</span>
          {!editing && <button onClick={startEdit} data-testid={`edit-draft-${contactId}`} className="float-right min-h-[28px] rounded-md border border-white/10 px-2.5 text-[13px] text-slate-300 hover:border-[var(--accent)]/50">Edit</button>}
          {!editing && <><br />Subject <span className="font-medium text-slate-100" data-testid="draft-subject-full">{d.subject}</span></>}
        </p>
        {editing ? (
          <div className="space-y-2">
            <input value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" data-testid="draft-edit-subject" maxLength={200} className="min-h-[36px] w-full rounded-md border border-white/10 bg-black/40 px-2 text-[15px] text-slate-100 outline-none focus:border-[var(--accent)]/60" />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} aria-label="Body" data-testid="draft-edit-body" maxLength={5000} rows={12} className="w-full rounded-md border border-white/10 bg-black/40 p-2 font-sans text-[15px] leading-relaxed text-slate-100 outline-none focus:border-[var(--accent)]/60" />
            <p className="text-[13px] text-amber-200/80">Saving clears Nick&apos;s PASS and any approval, so it goes back through Nick.</p>
            {saveErr && <p className="text-[14px] text-red-300">{saveErr}</p>}
            <div className="flex gap-2">
              <button onClick={save} disabled={saving || !subject.trim() || !body.trim()} data-testid="draft-edit-save" className="min-h-[32px] rounded-md bg-[var(--accent)] px-3 text-[14px] font-medium text-black hover:bg-[var(--accent-bright)] disabled:opacity-40">{saving ? "Saving…" : "Save draft"}</button>
              <button onClick={() => setEditing(false)} disabled={saving} className="min-h-[32px] rounded-md border border-white/10 px-3 text-[14px] text-slate-300">Cancel</button>
            </div>
          </div>
        ) : (
          <pre className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-slate-200" data-testid="draft-body">{d.body}</pre>
        )}
        {d.footer && <pre className="mt-3 whitespace-pre-wrap border-t border-dashed border-white/10 pt-2 font-sans text-[14px] leading-relaxed text-slate-500">{d.footer}</pre>}
      </div>
      <div className="space-y-2 text-[14px]">
        <div className="rounded-lg border border-white/[0.06] bg-black/30 p-2.5">
          <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-slate-500">Nick</p>
          <p className="mt-0.5 text-slate-200">{d.nick.verdict ?? "Not reviewed yet"}{d.nick.verdict && !d.nick.on_current_draft ? " (on an older version)" : ""}</p>
          {d.nick.note && <p className="mt-0.5 text-slate-400">{d.nick.note}</p>}
        </div>
        <div className={`rounded-lg border p-2.5 ${d.lint.length ? "border-red-500/30 bg-red-500/5" : "border-white/[0.06] bg-black/30"}`}>
          <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-slate-500">Copy check</p>
          {d.lint.length ? (
            <ul className="mt-0.5 space-y-0.5 text-red-300">{d.lint.map((i) => <li key={i.rule + i.match}>{i.rule}: {i.match}</li>)}</ul>
          ) : (
            <p className="mt-0.5 text-emerald-300">Clean</p>
          )}
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-black/30 p-2.5 text-slate-400">
          <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-slate-500">About this draft</p>
          <p className="mt-0.5">Written by {SOURCE[d.draft_source ?? ""] ?? "—"} · {d.body.split(/\s+/).filter(Boolean).length} words</p>
          <p>{d.approved ? `Approved by ${d.approved_by}` : "Not approved"}</p>
          {d.gap && <p className="mt-1 text-slate-500">Observed: {d.gap}</p>}
        </div>
      </div>
    </div>
  );
}
