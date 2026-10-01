"use client";

import { useRef, useState } from "react";
import { Modal } from "@/components/deck/DeckModals";
import { lintCopy } from "@/lib/field/lint";
import { composeOutgoing } from "@/lib/field/playbook";
import type { ConsoleConfig, FieldContact, NickVerdict } from "@/lib/field/types";
import { Button, Caption, PriorityBadge, StageBadge, cx } from "./ui";

type Contact = FieldContact & { suppressed: boolean };

interface Props {
  contact: Contact;
  config: ConsoleConfig;
  onChanged: (c: FieldContact) => void;
  onSent: () => void;
}

const OPEN = ["new", "drafted", "nick", "approved"];

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
  if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

function notionNote(n: unknown): string | null {
  if (n && typeof n === "object" && "error" in n) return `Saved here, but Notion write-back failed: ${(n as { error: string }).error}`;
  return null;
}

/** Remount per contact + draft (key) so the editor always starts from the saved draft. */
export function ContactPanel(props: Props) {
  return <Panel key={`${props.contact.id}:${props.contact.draftHash ?? "none"}`} {...props} />;
}

function Panel({ contact: c, config, onChanged, onSent }: Props) {
  const [subject, setSubject] = useState(c.subject);
  const [body, setBody] = useState(c.body);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const canGreenlight = config.canGreenlight;
  const dirty = subject !== c.subject || body !== c.body;
  const lint = lintCopy(subject, body);
  const editable = OPEN.includes(c.stage) && c.priority !== "Soft";

  const run = async (label: string, payload: Record<string, unknown>) => {
    setBusy(label);
    setErr(null);
    setInfo(null);
    try {
      const d = await post(`/api/field/contacts/${encodeURIComponent(c.id)}`, payload);
      onChanged(d.contact);
      setInfo(notionNote(d.notion));
      if (payload.action === "nick_verdict") setNote("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    setBusy("send");
    setErr(null);
    try {
      const d = await post(`/api/field/contacts/${encodeURIComponent(c.id)}/send`, { confirm: true, draftHash: c.draftHash });
      setConfirm(false);
      setInfo(notionNote(d.notion) ?? `Sent. AgentMail id ${d.log.agentmailMessageId}. ${c.email} suppressed.`);
      onSent();
    } catch (e) {
      setConfirm(false);
      setErr(e instanceof Error ? e.message : String(e));
      onSent(); // refresh — stage may have moved
    } finally {
      setBusy(null);
    }
  };

  const insert = (token: string) => {
    const el = bodyRef.current;
    if (!el) return setBody((b) => b + token);
    const { selectionStart: s, selectionEnd: e } = el;
    setBody((b) => b.slice(0, s) + token + b.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + token.length, s + token.length);
    });
  };

  // ── Gate reasons (mirror of the server rules; the server is authoritative) ──
  const nickReady = (c.stage === "drafted" || c.stage === "nick") && Boolean(c.draftHash) && !dirty;
  const passCurrent = c.stage === "nick" && c.nickVerdict === "PASS" && c.nickHash === c.draftHash;
  const approveWhy = !canGreenlight
    ? "Thomas-only (Ace needs FIELD_ACE_CAN_SEND)"
    : dirty
      ? "Save edits first"
      : !passCurrent
        ? "Needs Nick PASS on this draft"
        : c.suppressed
          ? "Recipient is suppressed"
          : lint.length
            ? "Fix the copy lint"
            : null;
  const sendWhy = !canGreenlight
    ? "Thomas-only (Ace needs FIELD_ACE_CAN_SEND)"
    : c.stage !== "approved"
      ? "Approve first"
      : dirty
        ? "Save edits first"
        : !config.agentmail
          ? "AgentMail not configured"
          : !config.mailingAddress
            ? "CAN-SPAM address missing"
            : config.sentToday >= config.dailyCap
              ? `Daily cap reached (${config.dailyCap})`
              : c.suppressed
                ? "Recipient is suppressed"
                : null;

  return (
    <div className="flex flex-col gap-5" data-testid="contact-panel">
      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <PriorityBadge priority={c.priority} />
          <StageBadge stage={c.stage} />
          {c.suppressed && <span className="rounded-full border border-red-500/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-red-400">Suppressed</span>}
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600">{c.source}</span>
        </div>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-zinc-50">{c.name}</h2>
        <p className="mt-0.5 text-sm text-zinc-400">
          {c.email || <span className="text-red-400">no email</span>} · {c.city || "—"} · {c.batch || "—"}
        </p>
        {c.gap && (
          <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-[13px] leading-relaxed text-zinc-300">
            <span className="mr-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Gap</span>
            {c.gap}
          </p>
        )}
        {c.priority === "Soft" && <p className="mt-3 text-[13px] text-amber-200/80">Soft tier — Hold only. Not draftable or sendable in v1.</p>}
        {c.lastError && c.stage === "approved" && <p className="mt-3 text-[13px] text-red-400">Last send attempt failed: {c.lastError}</p>}
      </div>

      {/* 1 — Draft */}
      <section className="rounded-2xl border border-white/10 bg-[#0c0d0e] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Caption>1 · Email 1 draft{c.draftSource ? ` · ${c.draftSource}` : ""}</Caption>
          {editable && (
            <div className="flex gap-2">
              <Button variant="quiet" disabled={!!busy} onClick={() => run("template", { action: "generate", mode: "template" })} data-testid="draft-template">
                {busy === "template" ? "…" : "Playbook template"}
              </Button>
              <Button variant="quiet" disabled={!!busy || !config.claude} title={config.claude ? "" : "AI_GATEWAY_API_KEY not set"} onClick={() => run("claude", { action: "generate", mode: "claude" })} data-testid="draft-claude">
                {busy === "claude" ? "Drafting…" : "Draft with Claude"}
              </Button>
            </div>
          )}
        </div>

        <div className={cx("mb-3 rounded-lg border px-3 py-2 text-[12px]", lint.length ? "border-red-500/50 bg-red-500/10 text-red-300" : "border-[#ff6a00]/30 bg-[#ff6a00]/[0.06] text-[#ffb066]")} data-testid="price-banner">
          <strong className="font-mono text-[10px] uppercase tracking-[0.2em]">Outreach brief</strong> · no prices, stats, client claims, HIPAA claims, &quot;week&quot;/&quot;weak&quot;, em dashes or hype. Under 110 words.
          {lint.length > 0 && <span className="mt-1 block">Found: {lint.map((i) => `“${i.match}” (${i.rule})`).join(", ")}</span>}
        </div>

        <label className="block">
          <span className="sr-only">Subject</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={!editable}
            placeholder="Subject"
            data-testid="draft-subject"
            className="min-h-[44px] w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#ff6a00]/60 disabled:opacity-60"
          />
        </label>
        <label className="mt-2 block">
          <span className="sr-only">Body</span>
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={!editable}
            rows={12}
            placeholder={editable ? "Generate from the playbook, or write Email 1 here." : ""}
            data-testid="draft-body"
            className="w-full resize-y rounded-xl border border-white/10 bg-black/40 p-3 text-sm leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#ff6a00]/60 disabled:opacity-60"
          />
        </label>
        {editable && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">Insert</span>
            <button type="button" onClick={() => insert(c.name)} className="min-h-[32px] rounded-lg border border-white/10 px-2 text-[12px] text-zinc-300 hover:bg-white/5">business</button>
            {c.city && (
              <button type="button" onClick={() => insert(c.city.replace(/\s*\(.*?\)\s*/g, " ").trim())} className="min-h-[32px] rounded-lg border border-white/10 px-2 text-[12px] text-zinc-300 hover:bg-white/5">city</button>
            )}
            <div className="ml-auto flex gap-2">
              {dirty && (
                <Button variant="quiet" onClick={() => { setSubject(c.subject); setBody(c.body); }}>Discard</Button>
              )}
              <Button variant="ghost" disabled={!dirty || !!busy || !subject.trim() || !body.trim()} onClick={() => run("save", { action: "save_draft", subject, body })} data-testid="draft-save">
                {busy === "save" ? "Saving…" : "Save draft"}
              </Button>
            </div>
          </div>
        )}
        {dirty && (c.nickVerdict === "PASS" || c.stage === "approved") && (
          <p className="mt-2 text-[12px] text-amber-200/80">Saving edits clears Nick PASS{c.stage === "approved" ? " and Thomas's approval" : ""}.</p>
        )}
      </section>

      {/* 2 — Nick */}
      <section className="rounded-2xl border border-white/10 bg-[#0c0d0e] p-4" data-testid="nick-section">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Caption>2 · Nick audit</Caption>
          {c.stage === "drafted" && (
            <Button variant="quiet" disabled={!nickReady || lint.length > 0 || !!busy} onClick={() => run("submit", { action: "submit_nick" })} data-testid="nick-submit">
              Mark sent to Nick
            </Button>
          )}
        </div>
        {c.nickVerdict ? (
          <p className="mb-3 text-sm text-zinc-300">
            <span className={cx("mr-2 font-mono text-[11px] tracking-widest", c.nickVerdict === "PASS" ? "text-emerald-300" : c.nickVerdict === "REVISE" ? "text-amber-200" : "text-red-400")}>{c.nickVerdict}</span>
            {c.nickNote && <span className="text-zinc-400">“{c.nickNote}”</span>}
            <span className="ml-2 font-mono text-[10px] text-zinc-600">{c.nickBy} · {c.nickAt ? new Date(c.nickAt).toLocaleString() : ""}</span>
            {c.nickVerdict === "PASS" && c.nickHash !== c.draftHash && <span className="mt-1 block text-[12px] text-amber-200/80">Draft changed after this PASS — needs a fresh audit.</span>}
          </p>
        ) : (
          <p className="mb-3 text-sm text-zinc-500">{c.stage === "nick" ? "Waiting on Nick." : "No verdict yet."}</p>
        )}
        {nickReady && (
          <>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Nick's note (optional)"
              data-testid="nick-note"
              className="mb-2 min-h-[44px] w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#ff6a00]/60"
            />
            <div className="grid grid-cols-3 gap-2">
              {(["PASS", "REVISE", "KILL"] as NickVerdict[]).map((v) => (
                <Button
                  key={v}
                  variant={v === "KILL" ? "danger" : "ghost"}
                  disabled={!!busy || (v === "PASS" && lint.length > 0)}
                  onClick={() => (v !== "KILL" || window.confirm(`Kill ${c.name}? This is final for Email 1.`)) && run(v, { action: "nick_verdict", verdict: v, note })}
                  data-testid={`nick-${v.toLowerCase()}`}
                >
                  {busy === v ? "…" : v}
                </Button>
              ))}
            </div>
          </>
        )}
        {dirty && (c.stage === "drafted" || c.stage === "nick") && <p className="text-[12px] text-zinc-500">Save the draft before recording a verdict.</p>}
      </section>

      {/* 3 — Approve / Send */}
      <section className="rounded-2xl border border-[#ff6a00]/25 bg-[#0c0d0e] p-4" data-testid="greenlight-section">
        <Caption className="mb-3">3 · Thomas greenlight</Caption>
        {c.stage === "sent" ? (
          <p className="text-sm text-emerald-300">Sent {c.sentAt ? new Date(c.sentAt).toLocaleString() : ""}. Logged and suppressed.</p>
        ) : c.stage === "sending" ? (
          <p className="text-sm text-[#ffb066]">Send in flight — if this persists, check the Log before doing anything else.</p>
        ) : (
          <>
            {c.stage === "approved" && (
              <p className="mb-3 text-sm text-zinc-300">Approved by Thomas {c.approvedAt ? new Date(c.approvedAt).toLocaleString() : ""}.</p>
            )}
            <div className="flex flex-wrap gap-2">
              {c.stage !== "approved" && (
                <Button variant="ghost" disabled={!!approveWhy || !!busy} onClick={() => run("approve", { action: "approve" })} data-testid="approve">
                  {busy === "approve" ? "…" : "Approve"}
                </Button>
              )}
              <Button variant="primary" disabled={!!sendWhy || !!busy} onClick={() => setConfirm(true)} data-testid="send-open">
                Send via AgentMail
              </Button>
            </div>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600" data-testid="greenlight-why">
              {c.stage === "approved" ? sendWhy ?? "Ready — one email, explicit confirm." : approveWhy ?? "Ready to approve."}
            </p>
          </>
        )}
      </section>

      {/* Hold */}
      {(OPEN.includes(c.stage) || c.stage === "hold") && (
        <div className="flex justify-end">
          {c.stage === "hold" ? (
            c.priority !== "Soft" && (
              <Button variant="quiet" disabled={!!busy} onClick={() => run("release", { action: "release" })} data-testid="release">Release hold</Button>
            )
          ) : (
            <Button variant="quiet" disabled={!!busy} onClick={() => run("hold", { action: "hold" })} data-testid="hold">Hold</Button>
          )}
        </div>
      )}

      {err && <p className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-[13px] text-red-300" role="alert" data-testid="panel-error">{err}</p>}
      {info && <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[13px] text-zinc-300" role="status" data-testid="panel-info">{info}</p>}

      {confirm && (
        <Modal title="Send Email 1 · confirm" onClose={() => busy !== "send" && setConfirm(false)} data-testid="send-confirm">
          <dl className="mb-3 grid grid-cols-[72px_1fr] gap-y-1 text-sm">
            <dt className="text-zinc-500">From</dt>
            <dd className="text-zinc-200">{config.inbox}</dd>
            <dt className="text-zinc-500">To</dt>
            <dd className="text-zinc-200">{c.email}</dd>
            <dt className="text-zinc-500">Subject</dt>
            <dd className="text-zinc-200">{c.subject}</dd>
          </dl>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/50 p-3 font-sans text-[13px] leading-relaxed text-zinc-300">
            {composeOutgoing(c.body, config.footer)}
          </pre>
          {!config.domainWarmed && <p className="mt-3 text-[12px] text-amber-200/80">Domain warm-up isn&apos;t confirmed (FIELD_DOMAIN_WARMED). Keep volume to one-at-a-time.</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="quiet" disabled={busy === "send"} onClick={() => setConfirm(false)}>Cancel</Button>
            <Button variant="primary" disabled={busy === "send"} onClick={send} data-testid="send-confirm-button">
              {busy === "send" ? "Sending…" : "Send 1 email"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
