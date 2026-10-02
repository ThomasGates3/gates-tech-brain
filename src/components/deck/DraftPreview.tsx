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

export function DraftPreview({ contactId, version }: { contactId: string; version: number }) {
  const [d, setD] = useState<Draft | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    callTool<Draft>("brain_get_draft", { contact_id: contactId })
      .then((r) => alive && (setD(r), setErr(null)))
      .catch((e) => alive && setErr(e instanceof Error ? e.message : String(e)));
    return () => { alive = false; };
  }, [contactId, version]);

  if (err) return <p className="text-[12px] text-red-300">{err}</p>;
  if (!d) return <p className="text-[12px] text-slate-500">Loading the email…</p>;
  if (!d.body) return <p className="text-[13px] text-slate-400" data-testid="draft-empty">No Email 1 draft yet. Use Template draft or Claude draft to write one.</p>;

  return (
    <div data-testid={`draft-${contactId}`} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="rounded-lg border border-white/10 bg-black/50 p-3">
        <p className="mb-2 border-b border-white/10 pb-2 text-[12px] text-slate-400">
          To <span className="text-slate-200">{d.contact_name ? `${d.contact_name} <${d.email}>` : d.email}</span>
          <br />Subject <span className="font-medium text-slate-100" data-testid="draft-subject-full">{d.subject}</span>
        </p>
        <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-slate-200" data-testid="draft-body">{d.body}</pre>
        {d.footer && <pre className="mt-3 whitespace-pre-wrap border-t border-dashed border-white/10 pt-2 font-sans text-[12px] leading-relaxed text-slate-500">{d.footer}</pre>}
      </div>
      <div className="space-y-2 text-[12px]">
        <div className="rounded-lg border border-white/[0.06] bg-black/30 p-2.5">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">Nick</p>
          <p className="mt-0.5 text-slate-200">{d.nick.verdict ?? "Not reviewed yet"}{d.nick.verdict && !d.nick.on_current_draft ? " (on an older version)" : ""}</p>
          {d.nick.note && <p className="mt-0.5 text-slate-400">{d.nick.note}</p>}
        </div>
        <div className={`rounded-lg border p-2.5 ${d.lint.length ? "border-red-500/30 bg-red-500/5" : "border-white/[0.06] bg-black/30"}`}>
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">Copy check</p>
          {d.lint.length ? (
            <ul className="mt-0.5 space-y-0.5 text-red-300">{d.lint.map((i) => <li key={i.rule + i.match}>{i.rule}: {i.match}</li>)}</ul>
          ) : (
            <p className="mt-0.5 text-emerald-300">Clean</p>
          )}
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-black/30 p-2.5 text-slate-400">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">About this draft</p>
          <p className="mt-0.5">Written by {SOURCE[d.draft_source ?? ""] ?? "—"} · {d.body.split(/\s+/).filter(Boolean).length} words</p>
          <p>{d.approved ? `Approved by ${d.approved_by}` : "Not approved"}</p>
          {d.gap && <p className="mt-1 text-slate-500">Observed: {d.gap}</p>}
        </div>
      </div>
    </div>
  );
}
