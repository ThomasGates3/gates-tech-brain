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
      <div className="relative w-full max-w-lg rounded-2xl border border-[var(--accent-deep,#0077b6)]/40 bg-[#08101f] p-5 shadow-2xl" style={{ boxShadow: "0 0 60px rgba(0,229,255,0.08)" }}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--accent-soft,#7fdfff)]">{title}</h2>
          <button onClick={onClose} data-testid="modal-close" className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/5" aria-label="Close">
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
      <p className="mb-3 text-sm text-slate-400">Choose which model runs the Conductor. Applies live to chat and automations.</p>
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
                <span className="text-sm font-medium text-slate-100">{o.label} <span className="ml-1 font-mono text-[10px] text-slate-500">{o.tier}</span></span>
                {active && <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-medium text-black">active</span>}
              </div>
              <p className="mt-1 text-[12px] text-slate-500">{o.note}</p>
              <p className="mt-1 font-mono text-[10px] text-slate-600">{o.model}</p>
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

// Gates Technologies Grok bot roster. Roster + status only: no wake, no send from here.
// Status stays "idle" until bots report in. Field path (locked): Ace loads High+Med →
// Darrell drafts Email 1 → Nick PASS → Thomas Approve → AgentMail. Soft = Hold.
type AgentStatus = "idle" | "active";
const AGENTS: { id: string; label: string; role: string; optional?: boolean; status: AgentStatus }[] = [
  { id: "ace", label: "Ace", role: "CoS / Field ops: queue load, Nick chase, send log", status: "idle" },
  { id: "darrell", label: "Darrell", role: "Cold Email 1 drafts (Field playbook, no prices)", status: "idle" },
  { id: "nick", label: "Nick", role: "Third-party audit PASS / REVISE / KILL (Approve locked until PASS)", status: "idle" },
  { id: "engine", label: "Engine", role: "Business-model / Legacy Labs canon guard (check-only, no send)", status: "idle" },
  { id: "ashley", label: "Ashley", role: "Local lead scout", status: "idle" },
  { id: "vera", label: "Vera", role: "Gap notes from survivors", status: "idle" },
  { id: "todd", label: "Todd", role: "One-page audits from Vera", status: "idle" },
  { id: "ukyo", label: "Ukyo", role: "Instagram client scout", status: "idle" },
  { id: "toga", label: "Toga", role: "IG DM openers", status: "idle" },
  { id: "brandi", label: "Brandi", role: "Site / brand critique", status: "idle" },
  { id: "spec", label: "Spec", role: "PRDs for builds", status: "idle" },
  { id: "lynx", label: "Lynx", role: "Builds from Spec packs only", status: "idle" },
  { id: "kennedy", label: "Kennedy", role: "Adversarial QA", status: "idle" },
  { id: "lisa", label: "Lisa", role: "Mail / calendar short replies", status: "idle" },
  { id: "hermes", label: "Hermes", role: "On-demand research", status: "idle" },
  { id: "floor", label: "Floor", role: "Sales floor", optional: true, status: "idle" },
  { id: "gates-tech", label: "Gates Tech", role: "Brand bot", optional: true, status: "idle" },
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
          <button key={t} data-testid={`conntab-${t}`} onClick={() => setTab(t)} className={`min-h-[32px] rounded-full px-3 text-[11px] capitalize ${tab === t ? "bg-[var(--accent)] text-black" : "bg-white/5 text-slate-400 hover:text-slate-200"}`}>{t}</button>
        ))}
      </div>

      <div className="max-h-[55vh] space-y-2 overflow-y-auto">
        {tab === "connections" && rows.map((c) => {
          const s = statuses[c.id];
          return (
            <div key={c.id} data-testid={`conn-${c.id}`} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-black/30 p-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${c.enabled ? "bg-emerald-400" : "bg-slate-600"}`} />
                  <span className="text-sm text-slate-100">{c.label}</span>
                </div>
                <p className="mt-0.5 font-mono text-[10px] text-slate-600">{c.toolCount} tools · {c.auth}{c.hasCredential ? "" : " · no key"}{s ? (s.reachable ? " · ✓ reachable" : " · ✗ unreachable") : ""}</p>
              </div>
              <button data-testid={`conn-test-${c.id}`} onClick={() => test(c.id)} disabled={testing === c.id} className="min-h-[32px] shrink-0 rounded-md border border-white/10 px-2.5 text-[11px] text-slate-300 hover:border-[var(--accent)]/50 disabled:opacity-50">{testing === c.id ? "…" : "Test"}</button>
            </div>
          );
        })}

        {tab === "agents" && AGENTS.map((a) => (
          <div key={a.id} data-testid={`agent-${a.id}`} data-status={a.status} className="rounded-lg border border-white/[0.06] bg-black/30 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-100">
                {a.label}
                {a.optional && <span className="ml-1.5 font-mono text-[10px] font-normal text-slate-600">optional</span>}
              </span>
              <span className={`flex shrink-0 items-center gap-1.5 font-mono text-[10px] ${a.status === "active" ? "text-[var(--accent-soft)]" : "text-slate-500"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${a.status === "active" ? "bg-[var(--accent)]" : "bg-slate-600"}`} />
                {a.status}
              </span>
            </div>
            <p className="mt-0.5 text-[12px] text-slate-500">{a.role}</p>
          </div>
        ))}

        {tab === "agents" && (
          <p data-testid="agents-tools-note" className="px-1 pt-1 text-[11px] leading-relaxed text-slate-600">
            Tools: NotebookLM is a creative assist for Ace and Brandi (infographics, leave-behinds, one-pagers). Not a Field send agent, and no prices in cold assets.
          </p>
        )}
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
          <span className={`text-sm ${item.urgent ? "text-[var(--accent-soft)]" : "text-slate-300"}`}>{item.label}</span>
          <span className="font-mono text-lg text-slate-100">{item.value}{item.delta && <span className="ml-2 text-[12px] text-emerald-400/80">{item.delta}</span>}</span>
        </div>
        <p className="mt-3 text-[13px] leading-6 text-slate-400">
          {item.urgent
            ? `This needs attention. Ask NOVA to break down "${item.label}" and draft next steps — type it in the chat and the Conductor will pull the details from the connected sources.`
            : `Tracked metric. Ask NOVA for a deeper breakdown of "${item.label}" in the chat anytime.`}
        </p>
      </div>
    </Modal>
  );
}
