"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { callTool } from "@/lib/ux/tools";
import { approveQueue, approvedUnsent, capLeft, statusLine, swipeAction } from "@/lib/ux/approve-queue";
import { toast } from "@/components/ui/Toast";
import type { InboundItem } from "@/lib/field/inbound";
import { RingGauge } from "@/components/deck/RingGauge";
import { PipelineFlow } from "@/components/deck/PipelineFlow";
import { BrainChat } from "@/components/deck/BrainChat";
import { MobileTabBar } from "@/components/deck/MobileTabBar";
import { Check, Inbox, MessageCircle, Workflow } from "lucide-react";

/**
 * Phone approve view (/m). One card per Nick-PASS draft: swipe right = Approve,
 * swipe left = Hold, tap Edit to rewrite. Every action calls the same Brain tools
 * as the desktop and the bots, so all gates (Nick PASS on the exact draft, lint,
 * suppression, cap, CAN-SPAM, warm-up, Thomas-only) stay on the server.
 */

interface Lead {
  contact_id: string; business: string; contact_name: string | null; email: string; tier: string;
  email1_status: string; suppressed: boolean; lint_issues: number; nick_verdict: string | null; nick_note: string | null; subject: string | null;
}
interface LeadsData { date: string; sentToday: number; gates: { domainWarmed: boolean; warmNote: string; dailyCap: number }; leads: Lead[] }
interface Draft { subject: string; body: string; footer: string | null; nick: { verdict: string | null; note: string | null; on_current_draft: boolean }; lint: { rule: string; match: string }[] }
type Kind = "approve" | "hold";
type Tab = "approve" | "pipeline" | "inbox" | "nova";
interface Budget { spentUsd: number; capUsd: number; warnUsd: number }
interface Pending { id: string; kind: Kind; business: string; timer: ReturnType<typeof setTimeout> }

const UNDO_MS = 5000;
const buzz = (ms = 12) => { try { navigator.vibrate?.(ms); } catch { /* not supported */ } };
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function ApproveDeck() {
  const [data, setData] = useState<LeadsData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [budget, setBudget] = useState<string | null>(null);
  const [budgetNum, setBudgetNum] = useState<Budget | null>(null);
  const [tab, setTab] = useState<Tab>("approve");
  const [pull, setPull] = useState(0);
  const pullStart = useRef<number | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft | "error">>({});
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [replies, setReplies] = useState<InboundItem[]>([]);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const pending = useRef<Pending | null>(null);
  const requested = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/leads");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Couldn't load today's leads");
      setData(d);
      setErr(null);
    } catch (e) { setErr(errText(e)); }
  }, []);

  const loadExtras = useCallback(() => {
    fetch("/api/deck").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d?.readouts?.claude) setBudget(d.readouts.claude);
      if (d?.budget) setBudgetNum(d.budget);
    }).catch(() => {});
    fetch("/api/inbound").then((r) => (r.ok ? r.json() : null)).then((r: { matched: InboundItem[]; unmatched: InboundItem[] } | null) => {
      if (!r) return;
      const rank = (i: InboundItem) => ["reply_handoff_lisa", "soft_hold", "suppress_opt_out"].indexOf(i.suggested);
      setReplies([...r.matched, ...r.unmatched].filter((i) => i.unanswered && i.suggested !== "ignore").sort((a, b) => rank(a) - rank(b) || b.last_at.localeCompare(a.last_at)));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const first = setTimeout(() => { void load(); loadExtras(); }, 0);
    const t = setInterval(load, 60_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [load, loadExtras]);

  // Pull down at the top of the page to refresh everything.
  const onTouchStart = (e: React.TouchEvent) => { pullStart.current = window.scrollY <= 0 && tab !== "nova" ? e.touches[0].clientY : null; };
  const onTouchMove = (e: React.TouchEvent) => { if (pullStart.current !== null) setPull(Math.max(0, Math.min(90, e.touches[0].clientY - pullStart.current))); };
  const onTouchEnd = () => {
    if (pull > 70) { buzz(8); void load(); loadExtras(); toast("Refreshed", { tone: "info", ms: 1500 }); }
    pullStart.current = null;
    setPull(0);
  };

  const leads = data?.leads ?? [];
  const queue = approveQueue(leads, pendingIds);
  const ready = approvedUnsent(leads);
  const current = queue[0];

  // Home-screen badge (installed app): how many drafts wait on Thomas.
  const waitingCount = data ? queue.length : null;
  useEffect(() => {
    if (waitingCount === null) return;
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    (waitingCount ? nav.setAppBadge?.(waitingCount) : nav.clearAppBadge?.())?.catch(() => {});
  }, [waitingCount]);

  // Load the full email for the top card and the one behind it.
  useEffect(() => {
    for (const l of queue.slice(0, 2)) {
      if (drafts[l.contact_id] || requested.current.has(l.contact_id)) continue;
      requested.current.add(l.contact_id);
      callTool<Draft>("brain_get_draft", { contact_id: l.contact_id })
        .then((d) => setDrafts((m) => ({ ...m, [l.contact_id]: d })))
        .catch(() => setDrafts((m) => ({ ...m, [l.contact_id]: "error" })));
    }
  }, [queue, drafts]);

  /** Run the real tool call once the undo window closes. Rolls back the card on error. */
  const commit = useCallback(async (p: Pending) => {
    clearTimeout(p.timer);
    if (pending.current?.id === p.id) pending.current = null;
    try {
      if (p.kind === "approve") await callTool("brain_approve", { contact_id: p.id });
      else await callTool("brain_hold", { contact_id: p.id, hold: true });
    } catch (e) {
      toast(`${p.business}: ${errText(e)}`, { tone: "error", ms: 6000 });
    } finally {
      setPendingIds((s) => { const n = new Set(s); n.delete(p.id); return n; });
      await load();
    }
  }, [load]);

  // Leaving the app mid-undo still saves the last action.
  useEffect(() => {
    const flush = () => { if (document.visibilityState === "hidden" && pending.current) void commit(pending.current); };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [commit]);

  const act = (lead: Lead, kind: Kind) => {
    if (pending.current) void commit(pending.current); // only one action in its undo window at a time
    buzz(kind === "approve" ? 14 : 8);
    const p: Pending = { id: lead.contact_id, kind, business: lead.business, timer: setTimeout(() => void commit(p), UNDO_MS) };
    pending.current = p;
    setPendingIds((s) => new Set(s).add(lead.contact_id));
    toast(`${kind === "approve" ? "Approved" : "Held"}: ${lead.business}`, {
      ms: UNDO_MS,
      action: {
        label: "Undo",
        run: () => {
          clearTimeout(p.timer);
          if (pending.current?.id === p.id) pending.current = null;
          setPendingIds((s) => { const n = new Set(s); n.delete(p.id); return n; });
        },
      },
    });
  };

  const warmed = Boolean(data?.gates.domainWarmed);
  const cap = data?.gates.dailyCap ?? 0;
  const sent = data?.sentToday ?? 0;

  const hotReplies = replies.filter((i) => i.suggested === "reply_handoff_lisa").length;

  return (
    <div
      className="m-shell relative isolate mx-auto flex min-h-[100dvh] max-w-md flex-col px-4 pb-4 pt-[calc(env(safe-area-inset-top)+12px)]"
      data-testid="m-deck"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div aria-hidden className="deck-bg" />
      {pull > 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center" style={{ transform: `translateY(${pull / 2}px)` }}>
          <span className={`mt-2 rounded-full border px-3 py-1 font-mono text-[13px] ${pull > 70 ? "border-[var(--accent)]/60 text-[var(--accent)]" : "border-white/10 text-[var(--mute)]"}`}>{pull > 70 ? "Release to refresh" : "Pull to refresh"}</span>
        </div>
      )}
      <header className="relative mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-mono text-[13px] uppercase tracking-[0.22em] text-[var(--mute)]"><span className="live-dot" />Gates Brain · Today</p>
          <p className="mt-0.5 text-[15px] leading-snug text-slate-100" data-testid="m-status">
            {data ? statusLine({ waiting: queue.length, sent, cap, warmed }) : <span className="skeleton inline-block h-4 w-56 rounded" />}
          </p>
          {budget && <p className="font-mono text-[13px] text-[var(--mute)]" data-testid="m-budget">Claude today {budget}</p>}
        </div>
        {/* Full page load on purpose: middleware sets the "desktop" cookie before redirecting. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/?view=desktop" className="btn-ghost shrink-0 px-3 py-2 text-[14px]" data-testid="m-desktop">Desktop view</a>
      </header>

      <SectionTabs tab={tab} onTab={(t) => { buzz(6); setTab(t); window.scrollTo({ top: 0 }); }} waiting={queue.length} replies={hotReplies || replies.length} />

      {err && <p className="relative mb-3 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-[15px] text-red-200">{err}</p>}

      {tab === "approve" && (
        <>
          {data && !warmed && <WarmupGate note={data.gates.warmNote} onDone={load} />}
          {replies.length > 0 && <InboxStrip items={replies} onAll={() => setTab("inbox")} />}
          {ready.length > 0 && (
            <button data-testid="m-send-open" onClick={() => setSendOpen(true)} className="btn-primary relative mb-3 min-h-[52px] w-full rounded-2xl text-[16px] font-semibold active:scale-[.99]">
              Send {ready.length} approved →
            </button>
          )}
          <main className="relative flex flex-1 flex-col">
            {!data && !err && <CardSkeleton />}
            {data && current && (
              <SwipeCard
                key={current.contact_id}
                lead={current}
                draft={drafts[current.contact_id]}
                left={queue.length}
                onApprove={() => act(current, "approve")}
                onHold={() => act(current, "hold")}
                onEdit={() => setEditing(current)}
              />
            )}
            {data && !current && (
              <div className="glass flex flex-1 flex-col items-center justify-center rounded-2xl px-6 py-12 text-center" data-testid="m-empty">
                <p className="text-[18px] font-medium text-slate-100">Nothing waiting on you</p>
                <p className="mt-2 max-w-[28ch] text-[15px] text-[var(--mute)]">
                  Drafts show up here once Nick passes them.{ready.length ? " Your approved emails are ready to send above." : ""}
                </p>
              </div>
            )}
          </main>
        </>
      )}

      {tab === "pipeline" && (
        <section className="relative space-y-4" data-testid="m-pipeline">
          <div className="glass flex justify-around rounded-2xl py-4">
            <RingGauge testId="m-ring-sends" label="Sends today" value={data ? sent : null} max={data ? cap : null} sub={data ? (warmed ? "warm-up ✓" : "warm-up ✗") : undefined} warnAt={0.9} />
            <RingGauge testId="m-ring-claude" label="Claude today" value={budgetNum ? budgetNum.spentUsd : null} max={budgetNum ? budgetNum.capUsd : null} format={(n) => `$${n.toFixed(2)}`} warnAt={budgetNum && budgetNum.capUsd ? budgetNum.warnUsd / budgetNum.capUsd : 0.8} />
          </div>
          <div className="glass rounded-2xl p-4">
            <p className="mb-3 font-mono text-[13px] uppercase tracking-[0.16em] text-[var(--mute)]">Today&apos;s pipeline</p>
            <PipelineFlow leads={leads} sentToday={sent} vertical loading={!data} />
          </div>
          {data && !warmed && <WarmupGate note={data.gates.warmNote} onDone={load} />}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/?view=desktop" className="btn-ghost min-h-[48px] w-full rounded-2xl text-[15px]">Open the full dashboard</a>
        </section>
      )}

      {tab === "inbox" && <RepliesList items={replies} />}

      {tab === "nova" && (
        <section className="relative h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-240px)]" data-testid="m-nova">
          <BrainChat personaName="NOVA" className="h-full" />
        </section>
      )}

      {/* Inside the shell so the edit and send sheets (z-80) still cover it. */}
      <MobileTabBar />

      {editing && <EditSheet lead={editing} draft={drafts[editing.contact_id]} onClose={() => setEditing(null)} onSaved={() => { requested.current.delete(editing.contact_id); setDrafts((m) => { const n = { ...m }; delete n[editing.contact_id]; return n; }); setEditing(null); void load(); }} />}
      {sendOpen && <SendSheet leads={ready} warmed={warmed} left={capLeft(sent, cap)} onClose={() => { setSendOpen(false); void load(); }} />}
    </div>
  );
}

const TABS: { id: Tab; label: string; Icon: typeof Check }[] = [
  { id: "approve", label: "Approve", Icon: Check },
  { id: "pipeline", label: "Pipeline", Icon: Workflow },
  { id: "inbox", label: "Replies", Icon: Inbox },
  { id: "nova", label: "NOVA", Icon: MessageCircle },
];

/** This page's own sections. The glass bar at the bottom is the site-wide navigation. */
function SectionTabs({ tab, onTab, waiting, replies }: { tab: Tab; onTab: (t: Tab) => void; waiting: number; replies: number }) {
  const badge: Partial<Record<Tab, number>> = { approve: waiting, inbox: replies };
  return (
    <nav aria-label="Sections" className="tabbar-glass sticky top-[calc(env(safe-area-inset-top)+8px)] z-30 mb-3 flex gap-0.5 rounded-2xl p-1" data-testid="m-tabs">
      {TABS.map(({ id, label, Icon }) => {
        const on = tab === id;
        return (
          <button key={id} onClick={() => onTab(id)} data-testid={`m-tab-${id}`} aria-current={on ? "page" : undefined} className={`flex min-h-[44px] flex-auto items-center justify-center gap-1 rounded-xl px-1.5 text-[14px] transition-colors active:scale-[.97] ${on ? "bg-[var(--accent)]/15 font-medium text-[var(--accent-bright)]" : "text-[var(--mute)]"}`}>
            <Icon size={15} strokeWidth={on ? 2.2 : 1.8} aria-hidden className="shrink-0" />
            {label}
            {!!badge[id] && <span className="min-w-[16px] rounded-full bg-[var(--accent)] px-1 text-center font-mono text-[13px] leading-[16px] text-black">{badge[id]}</span>}
          </button>
        );
      })}
    </nav>
  );
}

const REPLY_LABEL: Record<string, string> = { reply_handoff_lisa: "Wants to talk", soft_hold: "Not now", suppress_opt_out: "Opt-out" };

function RepliesList({ items }: { items: InboundItem[] }) {
  if (!items.length) {
    return (
      <div className="glass relative flex flex-1 flex-col items-center justify-center rounded-2xl px-6 py-12 text-center" data-testid="m-inbox-empty">
        <p className="text-[18px] font-medium text-slate-100">No replies waiting</p>
        <p className="mt-2 text-[15px] text-[var(--mute)]">Replies to your emails land here.</p>
      </div>
    );
  }
  return (
    <ul className="relative space-y-2" data-testid="m-inbox-list">
      {items.map((i) => (
        <li key={i.thread_id}>
          <a href={i.contact ? `/leads?open=${encodeURIComponent(i.contact.contact_id)}` : "/leads"} className={`glass block rounded-2xl px-4 py-3 ${i.suggested === "reply_handoff_lisa" ? "attn" : ""}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[16px] text-slate-100">{i.contact?.name ?? i.from}</span>
              <span className="shrink-0 font-mono text-[13px] text-[var(--accent-soft)]">{REPLY_LABEL[i.suggested] ?? i.suggested}</span>
            </div>
            {i.snippet && <p className="mt-1 line-clamp-3 text-[15px] text-[var(--body)]">“{i.snippet}”</p>}
            <p className="mt-1 font-mono text-[13px] text-[var(--mute)]">{new Date(i.last_at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}</p>
          </a>
        </li>
      ))}
    </ul>
  );
}

function CardSkeleton() {
  return (
    <div className="glass flex flex-1 flex-col gap-3 rounded-2xl p-5" aria-busy="true" data-testid="m-skeleton">
      <span className="skeleton h-5 w-2/3 rounded" />
      <span className="skeleton h-4 w-1/2 rounded" />
      <span className="skeleton mt-4 h-32 w-full rounded" />
    </div>
  );
}

function SwipeCard({ lead, draft, left, onApprove, onHold, onEdit }: { lead: Lead; draft: Draft | "error" | undefined; left: number; onApprove: () => void; onHold: () => void; onEdit: () => void }) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; locked: boolean | null } | null>(null);

  const onDown = (e: React.PointerEvent) => { if (e.pointerType !== "mouse" || e.button === 0) start.current = { x: e.clientX, y: e.clientY, locked: null }; };
  const onMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const mx = e.clientX - s.x, my = e.clientY - s.y;
    if (s.locked === null && Math.hypot(mx, my) > 8) {
      s.locked = Math.abs(mx) > Math.abs(my); // horizontal = swipe, vertical = scroll the email
      if (s.locked) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    if (s.locked) setDx(mx);
  };
  const onUp = () => {
    const a = swipeAction(dx);
    start.current = null;
    setDx(0);
    if (a === "approve") onApprove();
    else if (a === "hold") onHold();
  };

  const d = draft && draft !== "error" ? draft : null;
  const hint = swipeAction(dx);
  return (
    <div className="flex flex-1 flex-col" data-testid={`m-card-${lead.contact_id}`}>
      <article
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{ transform: dx ? `translateX(${dx}px) rotate(${dx / 40}deg)` : undefined, touchAction: "pan-y" }}
        className={`swipe-card glass relative flex min-h-[340px] flex-1 flex-col overflow-hidden rounded-2xl ${dx ? "" : "swipe-rest"} ${hint === "approve" ? "ring-2 ring-sky-300/60" : hint === "hold" ? "ring-2 ring-slate-400/50" : ""}`}
      >
        {hint && <span className={`absolute right-4 top-4 z-10 rounded-md px-2 py-1 font-mono text-[14px] uppercase tracking-wider ${hint === "approve" ? "bg-sky-300/20 text-sky-200" : "bg-white/10 text-slate-300"}`}>{hint === "approve" ? "Approve" : "Hold"}</span>}
        <div className="border-b border-white/[0.07] px-5 pb-3 pt-4">
          <div className="flex items-center gap-2 font-mono text-[13px] uppercase tracking-[0.16em] text-[var(--mute)]">
            <span>{lead.tier}</span><span>·</span><span>{left} left</span>
            <span className="ml-auto rounded bg-sky-400/10 px-1.5 py-0.5 text-sky-200">Nick PASS</span>
          </div>
          <p className="mt-2 text-[19px] font-semibold leading-tight text-slate-50" data-testid="m-business">{lead.business}</p>
          <p className="mt-0.5 truncate text-[15px] text-[var(--body)]">{lead.contact_name ? `${lead.contact_name} · ` : ""}{lead.email}</p>
          <p className="mt-3 text-[16px] font-medium text-slate-100" data-testid="m-subject">{d?.subject ?? lead.subject ?? ""}</p>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {draft === "error" && <p className="text-[15px] text-red-200">Couldn&apos;t load this email. Pull to refresh or open it on desktop.</p>}
          {!draft && <div className="space-y-2"><span className="skeleton block h-4 w-full rounded" /><span className="skeleton block h-4 w-5/6 rounded" /><span className="skeleton block h-4 w-4/6 rounded" /></div>}
          {d && (
            <>
              <pre className="whitespace-pre-wrap font-sans text-[16px] leading-[1.6] text-slate-200" data-testid="m-body">{d.body}</pre>
              {d.footer && <pre className="mt-4 whitespace-pre-wrap border-t border-dashed border-white/10 pt-3 font-sans text-[15px] leading-relaxed text-[var(--mute)]">{d.footer}</pre>}
              <div className="mt-4 space-y-2 text-[15px]">
                {d.nick.note && <p className="rounded-lg bg-white/[0.04] px-3 py-2 text-[var(--body)]"><span className="text-slate-100">Nick:</span> {d.nick.note}</p>}
                <p className={`rounded-lg px-3 py-2 ${d.lint.length ? "bg-red-500/10 text-red-200" : "bg-white/[0.04] text-sky-200"}`} data-testid="m-lint">
                  {d.lint.length ? `Copy check: ${d.lint.map((i) => i.rule).join(", ")}` : "Copy check: clean"}
                </p>
              </div>
            </>
          )}
        </div>
      </article>

      <div className="sticky bottom-0 z-20 -mx-4 mt-3 bg-gradient-to-t from-[#050914] from-[90%] to-transparent px-4 pb-[calc(env(safe-area-inset-bottom)+84px)] pt-4 lg:pb-2">
      <div className="grid grid-cols-3 gap-2">
        <button data-testid="m-hold" onClick={onHold} className="min-h-[56px] rounded-2xl border border-white/12 bg-white/[0.03] text-[16px] font-medium text-slate-200 active:scale-[.98]">Hold</button>
        <button data-testid="m-edit" onClick={onEdit} className="min-h-[56px] rounded-2xl border border-white/12 bg-white/[0.03] text-[16px] font-medium text-slate-200 active:scale-[.98]">Edit</button>
        <button data-testid="m-approve" onClick={onApprove} className="min-h-[56px] rounded-2xl bg-[var(--accent)] text-[16px] font-semibold text-black active:scale-[.98]">Approve</button>
        </div>
        <p className="mt-2 text-center text-[14px] text-[var(--mute)]">Swipe right to approve · left to hold</p>
      </div>
    </div>
  );
}

function Sheet({ title, onClose, children, testId }: { title: string; onClose: () => void; children: React.ReactNode; testId: string }) {
  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#050914]/98 backdrop-blur-xl" role="dialog" aria-modal="true" aria-label={title} data-testid={testId}>
      <div className="flex items-center justify-between border-b border-white/[0.07] px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)]">
        <p className="text-[17px] font-semibold text-slate-100">{title}</p>
        <button onClick={onClose} className="min-h-[44px] rounded-lg px-3 text-[15px] text-[var(--accent-soft)]">Close</button>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4">{children}</div>
    </div>
  );
}

function EditSheet({ lead, draft, onClose, onSaved }: { lead: Lead; draft: Draft | "error" | undefined; onClose: () => void; onSaved: () => void }) {
  const d = draft && draft !== "error" ? draft : null;
  const [subject, setSubject] = useState(d?.subject ?? lead.subject ?? "");
  const [body, setBody] = useState(d?.body ?? "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await callTool("brain_set_draft", { contact_id: lead.contact_id, subject, body });
      toast(`Saved. ${lead.business} goes back to Nick for a fresh PASS.`);
      onSaved();
    } catch (e) { toast(errText(e), { tone: "error", ms: 6000 }); } finally { setBusy(false); }
  };
  return (
    <Sheet title={`Edit · ${lead.business}`} onClose={onClose} testId="m-edit-sheet">
      <label className="font-mono text-[13px] uppercase tracking-[0.16em] text-[var(--mute)]" htmlFor="m-subj">Subject</label>
      <input id="m-subj" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} className="mt-1 min-h-[48px] rounded-xl border border-white/10 bg-black/40 px-3 text-[16px] text-slate-100 outline-none focus:border-[var(--accent)]/60" />
      <label className="mt-4 font-mono text-[13px] uppercase tracking-[0.16em] text-[var(--mute)]" htmlFor="m-body">Email</label>
      <textarea id="m-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} className="mt-1 min-h-[300px] flex-1 rounded-xl border border-white/10 bg-black/40 p-3 text-[16px] leading-[1.6] text-slate-100 outline-none focus:border-[var(--accent)]/60" />
      <p className="mt-2 text-[15px] text-[var(--mute)]">Saving clears Nick&apos;s PASS. The draft goes back to Nick before you can approve it.</p>
      <button data-testid="m-edit-save" disabled={busy || !subject.trim() || !body.trim()} onClick={save} className="mt-3 min-h-[56px] rounded-2xl bg-[var(--accent)] text-[16px] font-semibold text-black disabled:opacity-40">
        {busy ? "Saving…" : "Save and send to Nick"}
      </button>
    </Sheet>
  );
}

type SendResult = { id: string; ok: boolean; msg?: string };

/** Confirm sheet: lists every recipient, then sends ONE at a time via brain_approve_send. Stops on the first refusal (cap, warm-up 423, gate). */
function SendSheet({ leads, warmed, left, onClose }: { leads: Lead[]; warmed: boolean; left: number; onClose: () => void }) {
  const [results, setResults] = useState<SendResult[]>([]);
  const [running, setRunning] = useState(false);
  const [armed, setArmed] = useState(false);
  const batch = leads.slice(0, left);
  const run = async () => {
    if (!armed) return setArmed(true);
    setRunning(true);
    for (const l of batch) {
      try {
        await callTool("brain_approve_send", { contact_id: l.contact_id, confirm: true });
        setResults((r) => [...r, { id: l.contact_id, ok: true }]);
        buzz(10);
      } catch (e) {
        setResults((r) => [...r, { id: l.contact_id, ok: false, msg: errText(e) }]);
        break; // the server said no (cap, warm-up, gate): stop, don't keep trying
      }
    }
    setRunning(false);
  };
  const done = results.length > 0 && !running;
  const status = (id: string) => results.find((r) => r.id === id);
  return (
    <Sheet title={`Send ${batch.length} approved`} onClose={onClose} testId="m-send-sheet">
      {!warmed && <p className="mb-3 rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-[15px] text-amber-100">Warm-up isn&apos;t confirmed, so Brain will refuse every send. Confirm warm-up on the main screen first.</p>}
      {leads.length > batch.length && <p className="mb-3 text-[15px] text-[var(--mute)]">{leads.length - batch.length} more are approved but over today&apos;s cap. They wait for tomorrow.</p>}
      <ul className="space-y-2" data-testid="m-send-list">
        {batch.map((l) => {
          const s = status(l.contact_id);
          return (
            <li key={l.contact_id} className="glass rounded-xl px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[15px] text-slate-100">{l.business}</span>
                <span className={`shrink-0 font-mono text-[14px] ${s ? (s.ok ? "text-sky-200" : "text-red-200") : "text-[var(--mute)]"}`}>{s ? (s.ok ? "sent" : "stopped") : "queued"}</span>
              </div>
              <p className="truncate text-[15px] text-[var(--mute)]">{l.email}</p>
              {s?.msg && <p className="mt-1 text-[15px] text-red-200">{s.msg}</p>}
            </li>
          );
        })}
      </ul>
      <div className="mt-auto pt-4">
        {!done ? (
          <button data-testid="m-send-confirm" disabled={running || !batch.length} onClick={run} className={`min-h-[56px] w-full rounded-2xl text-[16px] font-semibold disabled:opacity-40 ${armed ? "bg-sky-200 text-black" : "bg-[var(--accent)] text-black"}`}>
            {running ? `Sending ${results.length + 1} of ${batch.length}…` : armed ? `Tap again to send ${batch.length}` : `Send ${batch.length} now`}
          </button>
        ) : (
          <button onClick={onClose} className="min-h-[56px] w-full rounded-2xl border border-white/12 text-[16px] text-slate-100">Done</button>
        )}
        <p className="mt-2 text-center text-[14px] text-[var(--mute)]">One at a time through the same gates as desktop.</p>
      </div>
    </Sheet>
  );
}

function WarmupGate({ note, onDone }: { note: string; onDone: () => void }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    if (!armed) return setArmed(true);
    setBusy(true);
    try { await callTool("brain_set_gate", { domain_warmed: true }); toast("Warm-up confirmed. Sends are open."); onDone(); }
    catch (e) { toast(errText(e), { tone: "error", ms: 6000 }); }
    finally { setBusy(false); setArmed(false); }
  };
  return (
    <div className="mb-3 rounded-2xl border border-amber-300/30 bg-amber-300/[0.07] px-4 py-3" data-testid="m-warmup">
      <p className="text-[15px] font-medium text-amber-100">Warm-up not confirmed: no sends</p>
      {note && <p className="mt-0.5 text-[15px] text-amber-100/70">{note}</p>}
      <button data-testid="m-warmup-confirm" onClick={confirm} disabled={busy} className="mt-2 min-h-[44px] rounded-xl border border-amber-200/40 px-3 text-[15px] text-amber-50 disabled:opacity-40">
        {busy ? "Saving…" : armed ? "Tap again to confirm warm-up" : "Confirm warm-up"}
      </button>
    </div>
  );
}

function InboxStrip({ items, onAll }: { items: InboundItem[]; onAll: () => void }) {
  const hot = items.filter((i) => i.suggested === "reply_handoff_lisa");
  const show = (hot.length ? hot : items).slice(0, 3);
  return (
    <section className="relative mb-3" data-testid="m-inbox">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="font-mono text-[13px] uppercase tracking-[0.16em] text-[var(--mute)]">{hot.length ? `${hot.length} want to talk` : `${items.length} replies`}</p>
        <button onClick={onAll} className="text-[14px] text-[var(--accent-soft)]">See all</button>
      </div>
      <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1">
        {show.map((i) => (
          <a key={i.thread_id} href={i.contact ? `/leads?open=${encodeURIComponent(i.contact.contact_id)}` : "/leads"} className="glass min-w-[78%] snap-start rounded-xl px-3 py-2.5">
            <p className="truncate text-[15px] text-slate-100">{i.contact?.name ?? i.from}</p>
            {i.snippet && <p className="mt-0.5 line-clamp-2 text-[15px] text-[var(--body)]">“{i.snippet}”</p>}
          </a>
        ))}
      </div>
    </section>
  );
}
