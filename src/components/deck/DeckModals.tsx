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

// ── Operations: Connections · Agents · Access ──────────────────────────────

interface ConnRow { id: string; label: string; auth: string; enabled: boolean; toolCount: number; hasCredential: boolean }
interface FieldConn { id: string; label: string; live: boolean; detail: string; setup: string[] }
interface Status { connectorId: string; reachable: boolean; message?: string }
interface AgentRow { id: string; label: string; role: string; optional?: boolean; status: "idle" | "active"; lastSeen: string | null; lastAction: string | null }
interface KeyRow { id: string; label: string; operator: string; prefix: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null }

const TABS = ["connections", "agents", "access"] as const;
const card = "rounded-lg border border-white/[0.06] bg-black/30 p-2.5";
const smallBtn = "min-h-[32px] shrink-0 rounded-md border border-white/10 px-2.5 text-[11px] text-slate-300 hover:border-[var(--accent)]/50 disabled:opacity-50";
const ago = (iso: string | null) => (iso ? `${Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60000))}m ago` : "never");

export function ConnectionsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("connections");
  const [rows, setRows] = useState<ConnRow[]>([]);
  const [field, setField] = useState<FieldConn[]>([]);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentRow[]>([]);

  useEffect(() => {
    fetch("/api/connectors").then((r) => r.json()).then((d) => { setRows(d.connectors ?? []); setField(d.field ?? []); }).catch(() => {});
    fetch("/api/agents").then((r) => r.json()).then((d) => setAgents(d.agents ?? [])).catch(() => {});
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
    <Modal title="Operations · Connections, Agents & Access" onClose={onClose} data-testid="connections-modal">
      <div className="mb-3 flex gap-1.5">
        {TABS.map((t) => (
          <button key={t} data-testid={`conntab-${t}`} onClick={() => setTab(t)} className={`min-h-[32px] rounded-full px-3 text-[11px] capitalize ${tab === t ? "bg-[var(--accent)] text-black" : "bg-white/5 text-slate-400 hover:text-slate-200"}`}>{t}</button>
        ))}
      </div>

      <div className="max-h-[55vh] space-y-2 overflow-y-auto">
        {tab === "connections" && (
          <>
            <p className="px-1 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Field</p>
            {field.map((f) => (
              <div key={f.id} data-testid={`conn-${f.id}`} data-live={f.live} className={card}>
                <div className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${f.live ? "bg-emerald-400" : "bg-amber-400"}`} />
                  <span className="text-sm text-slate-100">{f.label}</span>
                  <span className={`ml-auto font-mono text-[10px] ${f.live ? "text-emerald-300/80" : "text-amber-300/90"}`}>{f.live ? "live" : "needs key"}</span>
                </div>
                <p className="mt-0.5 font-mono text-[10px] text-slate-500">{f.detail}</p>
                {!f.live && (
                  <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-[11px] leading-5 text-slate-400">
                    {f.setup.map((step) => <li key={step}>{step}</li>)}
                  </ol>
                )}
              </div>
            ))}
            <p className="px-1 pt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Gates connectors</p>
            {rows.map((c) => {
              const s = statuses[c.id];
              return (
                <div key={c.id} data-testid={`conn-${c.id}`} className={`flex items-center justify-between ${card}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 rounded-full ${c.enabled ? "bg-emerald-400" : "bg-slate-600"}`} />
                      <span className="text-sm text-slate-100">{c.label}</span>
                    </div>
                    <p className="mt-0.5 font-mono text-[10px] text-slate-600">{c.toolCount} tools · {c.auth}{c.hasCredential ? "" : " · no key"}{s ? (s.reachable ? " · ✓ reachable" : " · ✗ unreachable") : ""}</p>
                  </div>
                  <button data-testid={`conn-test-${c.id}`} onClick={() => test(c.id)} disabled={testing === c.id} className={smallBtn}>{testing === c.id ? "…" : "Test"}</button>
                </div>
              );
            })}
          </>
        )}

        {tab === "agents" && agents.map((a) => (
          <div key={a.id} data-testid={`agent-${a.id}`} data-status={a.status} className={card}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-100">
                {a.label}
                {a.optional && <span className="ml-1.5 font-mono text-[10px] font-normal text-slate-600">optional</span>}
              </span>
              <span className={`flex shrink-0 items-center gap-1.5 font-mono text-[10px] ${a.status === "active" ? "text-[var(--accent-soft)]" : "text-slate-500"}`} title={a.lastAction ?? undefined}>
                <span className={`h-1.5 w-1.5 rounded-full ${a.status === "active" ? "bg-[var(--accent)]" : "bg-slate-600"}`} />
                {a.status}{a.lastSeen ? ` · ${ago(a.lastSeen)}` : ""}
              </span>
            </div>
            <p className="mt-0.5 text-[12px] text-slate-500">{a.role}</p>
          </div>
        ))}

        {tab === "agents" && (
          <p data-testid="agents-tools-note" className="px-1 pt-1 text-[11px] leading-relaxed text-slate-600">
            Active = the bot logged a call through MCP/REST in the last 30 minutes. Tools: NotebookLM is a creative assist for Ace and Brandi (infographics, leave-behinds, one-pagers). Not a Field send agent, and no prices in cold assets.
          </p>
        )}

        {tab === "access" && <AccessPanel />}
      </div>
    </Modal>
  );
}

function CopyLine({ label, value, testId }: { label: string; value: string; testId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={card}>
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <code data-testid={testId} className="min-w-0 flex-1 truncate font-mono text-[12px] text-slate-100">{value}</code>
        <button className={smallBtn} onClick={() => { void navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied" : "Copy"}</button>
      </div>
    </div>
  );
}

function AccessPanel() {
  const [keys, setKeys] = useState<KeyRow[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [label, setLabel] = useState("Ace");
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const load = () =>
    fetch("/api/keys").then(async (r) => {
      if (r.status === 403) return setDenied(true);
      setKeys((await r.json()).keys ?? []);
    }).catch(() => {});
  useEffect(() => { void load(); }, []);

  const create = async () => {
    setBusy(true);
    try {
      const d = await (await fetch("/api/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label, operator: "ace" }) })).json();
      if (d.key) setFresh(d.key);
      await load();
    } finally { setBusy(false); }
  };
  const revoke = async (id: string) => { await fetch(`/api/keys?id=${encodeURIComponent(id)}`, { method: "DELETE" }); await load(); };

  return (
    <div className="space-y-2" data-testid="access-panel">
      <CopyLine label="MCP server URL" value={`${origin}/api/mcp`} testId="mcp-url" />
      <CopyLine label="OpenAPI spec" value={`${origin}/api/v1/openapi.json`} testId="openapi-url" />
      <div className={`${card} text-[11px] leading-5 text-slate-400`}>
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Connect Grok</p>
        grok.com/connectors → New Connector → Custom → paste the MCP URL → add header <code className="text-slate-200">Authorization: Bearer &lt;key&gt;</code>. Bots pass <code className="text-slate-200">agent</code> (e.g. &quot;darrell&quot;) on each call so they show as active.
      </div>

      {denied ? (
        <p className={`${card} text-[12px] text-amber-200/90`}>Sign in with Thomas&apos;s password to create or revoke API keys.</p>
      ) : (
        <>
          <div className={`${card} flex items-center gap-2`}>
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} data-testid="key-label" aria-label="Key label" className="min-h-[36px] min-w-0 flex-1 rounded-md border border-white/10 bg-black/40 px-2.5 text-[13px] text-slate-100 outline-none focus:border-[var(--accent)]/60" />
            <button onClick={create} disabled={busy || !label.trim()} data-testid="key-create" className="min-h-[36px] rounded-md bg-[var(--accent)] px-3 text-[12px] font-medium text-black disabled:opacity-50">{busy ? "Creating…" : "Create key"}</button>
          </div>
          {fresh && (
            <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-2.5" data-testid="key-fresh">
              <p className="text-[11px] text-amber-200">Copy this key now. It won&apos;t be shown again.</p>
              <CopyLine label="New API key" value={fresh} testId="key-value" />
            </div>
          )}
          {keys?.map((k) => (
            <div key={k.id} data-testid={`key-${k.id}`} className={`flex items-center justify-between ${card} ${k.revokedAt ? "opacity-50" : ""}`}>
              <div className="min-w-0">
                <p className="text-sm text-slate-100">{k.label} <span className="font-mono text-[10px] text-slate-500">{k.prefix}… · {k.operator}</span></p>
                <p className="font-mono text-[10px] text-slate-600">created {ago(k.createdAt)} · last used {ago(k.lastUsedAt)}{k.revokedAt ? " · revoked" : ""}</p>
              </div>
              {!k.revokedAt && <button onClick={() => revoke(k.id)} data-testid={`key-revoke-${k.id}`} className={smallBtn}>Revoke</button>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ── Briefing item detail ────────────────────────────────────────────────────

export function BriefingDetailModal({ item, onClose }: { item: BriefingHighlight; onClose: () => void }) {
  return (
    <Modal title={`Briefing · ${item.label}`} onClose={onClose} data-testid="briefing-detail-modal">
      <div className="rounded-xl border border-white/10 bg-black/30 p-4">
        <div className="flex items-baseline justify-between">
          <span className={`text-sm ${item.urgent ? "text-[var(--accent-soft)]" : "text-slate-300"}`}>{item.label}</span>
          <span className="font-mono text-lg text-slate-100">{item.value}</span>
        </div>
        {item.detail && <p className="mt-2 font-mono text-[11px] text-slate-500">{item.detail}</p>}
        <p className="mt-3 text-[13px] leading-6 text-slate-400">
          {item.urgent ? "This needs attention. Open the Field Console to act on it." : "Live from today's Field data."}{" "}
          <a href="/field" className="text-[var(--accent-soft)] underline-offset-2 hover:underline">Open Field →</a>
        </p>
      </div>
    </Modal>
  );
}
