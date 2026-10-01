"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/deck/DeckModals";
import type { ConsoleConfig, FieldContact, QueueResponse } from "@/lib/field/types";
import { ContactPanel } from "./ContactPanel";
import { LogView } from "./LogView";
import { Button, Caption, Dot, PriorityBadge, StageBadge, cx } from "./ui";

type Contact = QueueResponse["contacts"][number];

function StatusBar({ config }: { config: ConsoleConfig }) {
  const items: { label: string; ok: boolean; warn?: boolean; detail: string }[] = [
    { label: "Notion", ok: config.notion, warn: true, detail: config.notion ? "Cold emails DB" : "not set — CSV fallback" },
    { label: "AgentMail", ok: config.agentmail, detail: config.inbox ?? "not configured" },
    { label: "CAN-SPAM address", ok: Boolean(config.mailingAddress), detail: config.mailingAddress ? "set" : "missing — sends blocked" },
    { label: "Domain warm-up", ok: config.domainWarmed, warn: true, detail: config.domainWarmed ? "confirmed" : "unconfirmed (outside app)" },
    { label: "Claude", ok: config.claude, warn: true, detail: config.claude ? "drafting on" : "template only" },
    { label: "Sent today", ok: config.sentToday < config.dailyCap, detail: `${config.sentToday} / ${config.dailyCap}` },
  ];
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-2xl border border-white/10 bg-[#08101f] px-4 py-3" data-testid="status-bar">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-2 text-[12px]">
          <Dot ok={i.ok} warn={i.warn} />
          <span className="text-slate-300">{i.label}</span>
          <span className="text-slate-500">{i.detail}</span>
        </div>
      ))}
    </div>
  );
}

export function FieldConsole() {
  const [tab, setTab] = useState<"queue" | "log">("queue");
  const [date, setDate] = useState<string | null>(null);
  const [data, setData] = useState<QueueResponse | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState<"queue" | "notion" | "csv" | null>("queue");
  const [notice, setNotice] = useState<string | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [showClosed, setShowClosed] = useState(false);

  const refresh = useCallback(async (d: string | null) => {
    try {
      const res = await fetch(`/api/field/queue${d ? `?date=${d}` : ""}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setData(body);
      setDate(body.date);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void refresh(null);
  }, [refresh]);

  const load = async (source: "notion" | "csv") => {
    if (!date) return;
    setLoading(source);
    setNotice(null);
    try {
      const res = await fetch("/api/field/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(source === "csv" ? { source, date, csv } : { source, date }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setNotice(`${source === "notion" ? "Notion" : "CSV"}: ${body.added} added, ${body.updated} refreshed${body.skipped ? `, ${body.skipped} skipped` : ""}.`);
      if (source === "csv") {
        setCsv("");
        setCsvOpen(false);
      }
      await refresh(date);
    } catch (e) {
      setNotice(null);
      setErr(e instanceof Error ? e.message : String(e));
      setLoading(null);
    }
  };

  const contacts = useMemo(() => data?.contacts ?? [], [data]);
  const visible = useMemo(
    () => contacts.filter((c) => showClosed || (c.priority !== "Soft" && c.stage !== "kill")),
    [contacts, showClosed]
  );
  const current = contacts.find((c) => c.id === selected) ?? null;
  const counts = useMemo(() => {
    const by = (f: (c: Contact) => boolean) => contacts.filter(f).length;
    return {
      sendable: by((c) => c.priority !== "Soft"),
      awaitingNick: by((c) => c.stage === "nick" && c.nickVerdict !== "PASS"),
      readyForThomas: by((c) => c.stage === "nick" && c.nickVerdict === "PASS"),
      approved: by((c) => c.stage === "approved"),
      sent: by((c) => c.stage === "sent"),
      held: by((c) => c.priority === "Soft" || c.stage === "kill"),
    };
  }, [contacts]);

  const onChanged = (c: FieldContact) =>
    setData((d) => (d ? { ...d, contacts: d.contacts.map((x) => (x.id === c.id ? { ...x, ...c } : x)) } : d));

  const operatorLabel = data?.config.operator === "thomas" ? "Thomas · greenlight" : data?.config.operator === "ace" ? "Ace · ops" : "";

  return (
    <div className="min-h-screen bg-[#050914] text-slate-100">
      <div className="pointer-events-none fixed inset-0" style={{ background: "radial-gradient(900px 400px at 15% -10%, rgba(0,229,255,0.08), transparent 70%)" }} />
      <div className="relative mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Caption>Gates · internal ops</Caption>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Field Console</h1>
            <p className="mt-1 text-sm text-slate-500">Email 1 · morning pack → draft → Nick PASS → Thomas approve → AgentMail → log</p>
          </div>
          <div className="flex items-center gap-2">
            {operatorLabel && <span className="rounded-full border border-white/15 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-300" data-testid="operator">{operatorLabel}</span>}
            <Link href="/" className="min-h-[44px] content-center rounded-xl px-3 text-sm text-slate-400 hover:bg-white/5">Deck</Link>
            <Button
              variant="quiet"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
                window.location.href = "/sign-in?callbackUrl=/field";
              }}
            >
              Sign out
            </Button>
          </div>
        </header>

        {data && <StatusBar config={data.config} />}

        <nav className="mt-5 flex gap-1" role="tablist">
          {(["queue", "log"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              data-testid={`tab-${t}`}
              className={cx("min-h-[44px] rounded-xl px-4 font-mono text-[11px] uppercase tracking-[0.2em]", tab === t ? "bg-white/10 text-slate-100" : "text-slate-500 hover:text-slate-300")}
            >
              {t}
            </button>
          ))}
        </nav>

        {err && (
          <p className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-[13px] text-red-300" role="alert" data-testid="console-error">
            {err}
          </p>
        )}

        {tab === "log" ? (
          <div className="mt-5">
            <LogView />
          </div>
        ) : (
          <div className="mt-5 grid gap-6 lg:grid-cols-[420px_1fr]">
            {/* Queue */}
            <section className={cx(current && "hidden lg:block")} data-testid="queue">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={date ?? ""}
                  onChange={(e) => {
                    setSelected(null);
                    setLoading("queue");
                    void refresh(e.target.value);
                  }}
                  aria-label="Pack date"
                  data-testid="pack-date"
                  className="min-h-[44px] rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-slate-100 [color-scheme:dark]"
                />
                <Button variant="primary" disabled={!data?.config.notion || !!loading} onClick={() => load("notion")} title={data?.config.notion ? "" : "NOTION_TOKEN / data source not set"} data-testid="load-notion">
                  {loading === "notion" ? "Loading…" : "Load morning pack"}
                </Button>
                <Button variant="quiet" disabled={!!loading} onClick={() => setCsvOpen(true)} data-testid="load-csv-open">
                  CSV
                </Button>
              </div>
              {notice && <p className="mb-3 text-[12px] text-slate-400" role="status">{notice}</p>}

              {data && (
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500" data-testid="queue-counts">
                  {counts.sendable} High+Med · {counts.awaitingNick} at Nick · {counts.readyForThomas} PASS → Thomas · {counts.approved} approved · {counts.sent} sent
                </p>
              )}

              <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-[#08101f]">
                {loading === "queue" && <li className="p-4 text-sm text-slate-500">Loading queue…</li>}
                {!loading && data && visible.length === 0 && (
                  <li className="p-4 text-sm text-slate-500">
                    No High/Med contacts for {date}. {data.config.notion ? "Load the morning pack from Notion" : "Paste a CSV"} to start.
                  </li>
                )}
                {visible.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => setSelected(c.id)}
                      data-testid="queue-row"
                      className={cx("flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]", selected === c.id && "bg-[#00e5ff]/[0.07]")}
                    >
                      <PriorityBadge priority={c.priority} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-slate-100">{c.name}</span>
                        <span className="block truncate text-[12px] text-slate-500">{c.batch || c.city || c.email}</span>
                      </span>
                      {c.suppressed && c.stage !== "sent" && <span className="font-mono text-[10px] text-red-400">SUPP</span>}
                      {c.nickVerdict === "PASS" && c.stage === "nick" && <span className="font-mono text-[10px] text-emerald-300">PASS</span>}
                      <StageBadge stage={c.stage} />
                    </button>
                  </li>
                ))}
              </ul>
              {counts.held > 0 && (
                <button onClick={() => setShowClosed((s) => !s)} className="mt-2 min-h-[44px] px-1 text-[12px] text-slate-500 hover:text-slate-300" data-testid="toggle-held">
                  {showClosed ? "Hide" : "Show"} {counts.held} Soft (Hold-only) / killed
                </button>
              )}
            </section>

            {/* Detail */}
            <section className={cx(!current && "hidden lg:block")}>
              {current && data ? (
                <>
                  <Button variant="quiet" className="mb-3 lg:hidden" onClick={() => setSelected(null)}>← Queue</Button>
                  <ContactPanel contact={current} config={data.config} onChanged={onChanged} onSent={() => refresh(date)} />
                </>
              ) : (
                <div className="grid min-h-[300px] place-items-center rounded-2xl border border-dashed border-white/10 text-sm text-slate-500">
                  Pick a contact from the queue.
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {csvOpen && (
        <Modal title="CSV fallback · paste pack" onClose={() => setCsvOpen(false)} data-testid="csv-modal">
          <p className="mb-2 text-[13px] text-slate-400">
            Columns like the Notion DB: <span className="font-mono text-slate-300">Name, To, Priority, City, Gap, Batch</span> (optional Subject, Body, Status). Loads into {date}. Soft rows land on Hold.
          </p>
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            rows={10}
            data-testid="csv-input"
            placeholder={"Name,To,Priority,City,Gap,Batch\nPele Aesthetics,info@spapele.com,High,Marietta,Closed Sundays...,ATL med spa"}
            className="w-full rounded-xl border border-white/10 bg-black/50 p-3 font-mono text-[12px] text-slate-200 outline-none focus:border-[#00e5ff]/60"
          />
          <label className="mt-2 inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-[13px] text-slate-400">
            <input
              type="file"
              accept=".csv,text/csv"
              className="text-[12px]"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setCsv(await f.text());
              }}
            />
          </label>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="quiet" onClick={() => setCsvOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={!csv.trim() || loading === "csv"} onClick={() => load("csv")} data-testid="csv-load">
              {loading === "csv" ? "Loading…" : "Load CSV"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
