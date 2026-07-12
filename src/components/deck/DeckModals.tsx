"use client";

import { useEffect, useState } from "react";
import type { BriefingHighlight } from "@/lib/persona/presets";

// ── Reusable modal shell ────────────────────────────────────────────────────

export function Modal({ title, onClose, children, "data-testid": testId }: { title: string; onClose: () => void; children: React.ReactNode; "data-testid"?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid={testId}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-[var(--accent-deep,#b34400)]/40 bg-[#0c0d0e] p-5 shadow-2xl" style={{ boxShadow: "0 0 60px rgba(255,106,0,0.08)" }}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--accent-soft,#ffb066)]">{title}</h2>
          <button onClick={onClose} data-testid="modal-close" className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-white/5" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Model / System settings ─────────────────────────────────────────────────

interface ModelOption { tier: "standard" | "flagship"; label: string; model: string; note: string }

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [tier, setTier] = useState<string>("");
  const [options, setOptions] = useState<ModelOption[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((d) => { setTier(d.modelTier); setOptions(d.options ?? []); }).catch(() => {});
  }, []);

  const pick = async (t: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modelTier: t }) });
      const d = await res.json();
      if (d.ok) setTier(d.modelTier);
    } finally { setSaving(false); }
  };

  return (
    <Modal title="System · Model" onClose={onClose} data-testid="settings-modal">
      <p className="mb-3 text-sm text-zinc-400">Choose which model runs the Conductor. Applies live to chat and automations.</p>
      <div className="space-y-2">
        {options.map((o) => {
          const active = tier === o.tier;
          return (
            <button
              key={o.tier}
              data-testid={`model-${o.tier}`}
              onClick={() => pick(o.tier)}
              disabled={saving}
              className={`w-full rounded-xl border p-3 text-left transition-colors ${active ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-white/10 bg-black/30 hover:border-white/20"}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-100">{o.label} <span className="ml-1 font-mono text-[10px] text-zinc-500">{o.tier}</span></span>
                {active && <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-medium text-black">active</span>}
              </div>
              <p className="mt-1 text-[12px] text-zinc-500">{o.note}</p>
              <p className="mt-1 font-mono text-[10px] text-zinc-600">{o.model}</p>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

// ── Connections & Agents ────────────────────────────────────────────────────

interface ConnRow { id: string; label: string; auth: string; enabled: boolean; toolCount: number; hasCredential: boolean }
interface Status { connectorId: string; reachable: boolean; message?: string }

const AGENTS = [
  { id: "research", label: "Research", uses: "NotebookLM · web", desc: "Ingests sources, builds briefings, cites answers." },
  { id: "data", label: "Data", uses: "Postgres · BigQuery", desc: "Queries and summarizes business data." },
  { id: "devops", label: "DevOps", uses: "GitHub · Vercel · AWS", desc: "Inspects deploys, repos, and infra." },
  { id: "comms", label: "Comms", uses: "Slack/Discord · email", desc: "Sends notifications and delivers reports." },
  { id: "operator", label: "Operator", uses: "Your apps · dev-agent", desc: "Runs Twin Trading, Ad System, Gates Tech, Speed to Lead; dispatches dev tasks." },
];

export function ConnectionsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"connections" | "agents">("connections");
  const [rows, setRows] = useState<ConnRow[]>([]);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/connectors").then((r) => r.json()).then((d) => setRows(d.connectors ?? [])).catch(() => {});
  }, []);

  const test = async (id: string) => {
    setTesting(id);
    try {
      const res = await fetch("/api/connectors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const s = await res.json();
      setStatuses((p) => ({ ...p, [id]: s }));
    } finally { setTesting(null); }
  };

  return (
    <Modal title="Operations · Connections & Agents" onClose={onClose} data-testid="connections-modal">
      <div className="mb-3 flex gap-1.5">
        {(["connections", "agents"] as const).map((t) => (
          <button key={t} data-testid={`conntab-${t}`} onClick={() => setTab(t)} className={`min-h-[32px] rounded-full px-3 text-[11px] capitalize ${tab === t ? "bg-[var(--accent)] text-black" : "bg-white/5 text-zinc-400 hover:text-zinc-200"}`}>{t}</button>
        ))}
      </div>

      <div className="max-h-[55vh] space-y-2 overflow-y-auto">
        {tab === "connections" && rows.map((c) => {
          const s = statuses[c.id];
          return (
            <div key={c.id} data-testid={`conn-${c.id}`} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-black/30 p-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${c.enabled ? "bg-emerald-400" : "bg-zinc-600"}`} />
                  <span className="text-sm text-zinc-100">{c.label}</span>
                </div>
                <p className="mt-0.5 font-mono text-[10px] text-zinc-600">{c.toolCount} tools · {c.auth}{c.hasCredential ? "" : " · no key"}{s ? (s.reachable ? " · ✓ reachable" : " · ✗ unreachable") : ""}</p>
              </div>
              <button data-testid={`conn-test-${c.id}`} onClick={() => test(c.id)} disabled={testing === c.id} className="min-h-[32px] shrink-0 rounded-md border border-white/10 px-2.5 text-[11px] text-zinc-300 hover:border-[var(--accent)]/50 disabled:opacity-50">{testing === c.id ? "…" : "Test"}</button>
            </div>
          );
        })}

        {tab === "agents" && AGENTS.map((a) => (
          <div key={a.id} data-testid={`agent-${a.id}`} className="rounded-lg border border-white/[0.06] bg-black/30 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-100">{a.label}</span>
              <span className="font-mono text-[10px] text-[var(--accent-soft)]">{a.uses}</span>
            </div>
            <p className="mt-0.5 text-[12px] text-zinc-500">{a.desc}</p>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ── Briefing item detail ────────────────────────────────────────────────────

export function BriefingDetailModal({ item, onClose }: { item: BriefingHighlight; onClose: () => void }) {
  return (
    <Modal title={`Briefing · ${item.label}`} onClose={onClose} data-testid="briefing-detail-modal">
      <div className="rounded-xl border border-white/10 bg-black/30 p-4">
        <div className="flex items-baseline justify-between">
          <span className={`text-sm ${item.urgent ? "text-[var(--accent-soft)]" : "text-zinc-300"}`}>{item.label}</span>
          <span className="font-mono text-lg text-zinc-100">{item.value}{item.delta && <span className="ml-2 text-[12px] text-emerald-400/80">{item.delta}</span>}</span>
        </div>
        <p className="mt-3 text-[13px] leading-6 text-zinc-400">
          {item.urgent
            ? `This needs attention. Ask NOVA to break down "${item.label}" and draft next steps — type it in the chat and the Conductor will pull the details from the connected sources.`
            : `Tracked metric. Ask NOVA for a deeper breakdown of "${item.label}" in the chat anytime.`}
        </p>
      </div>
    </Modal>
  );
}
