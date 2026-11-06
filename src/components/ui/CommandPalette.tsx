"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { NAV } from "@/components/deck/TopNav";
import { callTool } from "@/lib/ux/tools";
import { toast } from "@/components/ui/Toast";

/**
 * Cmd/Ctrl-K: jump to a page or a lead, approve or hold a Nick-PASS lead, open an automation.
 * Approve/Hold call the same Brain tools as the buttons (server enforces every gate).
 * Automations open their page instead of running from here (a run spends Claude budget).
 */
interface Lead { contact_id: string; business: string; email: string; email1_status: string }
interface Cmd { id: string; label: string; hint: string; run: () => void | Promise<void> }

export function CommandPalette() {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [autos, setAutos] = useState<{ id: string; name: string }[]>([]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setQ(""); setIdx(0); setOpen((o) => !o); }
      else if (e.key === "Escape") setOpen(false);
    };
    // The phone tab bar's Search button opens the palette too.
    const openFromUi = () => { setQ(""); setIdx(0); setOpen(true); };
    window.addEventListener("keydown", on);
    window.addEventListener("brain:palette", openFromUi);
    return () => { window.removeEventListener("keydown", on); window.removeEventListener("brain:palette", openFromUi); };
  }, []);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => input.current?.focus(), 0);
    fetch("/api/leads").then((r) => (r.ok ? r.json() : null)).then((d) => d?.leads && setLeads(d.leads)).catch(() => {});
    fetch("/api/automations").then((r) => (r.ok ? r.json() : null)).then((d) => d?.automations && setAutos(d.automations)).catch(() => {});
  }, [open]);

  const go = useCallback((href: string) => { setOpen(false); router.push(href); }, [router]);
  const tool = useCallback(async (label: string, name: string, args: Record<string, unknown>) => {
    setOpen(false);
    try { await callTool(name, args); toast(label); router.refresh(); window.dispatchEvent(new Event("brain:refresh")); }
    catch (e) { toast(e instanceof Error ? e.message : String(e), { tone: "error", ms: 6000 }); }
  }, [router]);

  const cmds = useMemo<Cmd[]>(() => {
    const out: Cmd[] = [
      ...NAV.map((n) => ({ id: `nav:${n.href}`, label: n.label, hint: "Page", run: () => go(n.href) })),
      { id: "nav:/m", label: "Phone approve view", hint: "Page", run: () => go("/m") },
    ];
    for (const l of leads) {
      out.push({ id: `lead:${l.contact_id}`, label: l.business, hint: `Lead · ${l.email1_status}`, run: () => go(`/leads?open=${encodeURIComponent(l.contact_id)}`) });
      if (l.email1_status === "PASS") {
        out.push({ id: `approve:${l.contact_id}`, label: `Approve ${l.business}`, hint: "Nick PASS", run: () => tool(`Approved: ${l.business}`, "brain_approve", { contact_id: l.contact_id }) });
        out.push({ id: `hold:${l.contact_id}`, label: `Hold ${l.business}`, hint: "Park it", run: () => tool(`Held: ${l.business}`, "brain_hold", { contact_id: l.contact_id, hold: true }) });
      }
    }
    for (const a of autos) out.push({ id: `auto:${a.id}`, label: a.name, hint: "Automation", run: () => go(`/automations#${a.id}`) });
    return out;
  }, [leads, autos, go, tool]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = t ? cmds.filter((c) => `${c.label} ${c.hint}`.toLowerCase().includes(t)) : cmds.filter((c) => !c.id.startsWith("approve:") && !c.id.startsWith("hold:"));
    return list.slice(0, 40);
  }, [q, cmds]);

  if (!open || path === "/m") return null;
  const sel = Math.min(idx, Math.max(0, shown.length - 1));

  return (
    <div className="fixed inset-0 z-[85] flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm" onClick={() => setOpen(false)} data-testid="cmdk">
      <div className="glass w-full max-w-xl overflow-hidden rounded-2xl toast-in" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Command palette">
        <input
          ref={input}
          value={q}
          onChange={(e) => { setQ(e.target.value); setIdx(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, shown.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
            else if (e.key === "Enter" && shown[sel]) { e.preventDefault(); void shown[sel].run(); }
          }}
          placeholder="Jump to a lead, approve, hold, open a page…"
          className="w-full border-b border-white/[0.07] bg-transparent px-5 py-4 text-[16px] text-slate-100 outline-none placeholder:text-[var(--mute)]"
          data-testid="cmdk-input"
        />
        <ul className="max-h-[50vh] overflow-y-auto py-2" role="listbox">
          {shown.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === sel}>
              <button
                onMouseEnter={() => setIdx(i)}
                onClick={() => void c.run()}
                className={`flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left text-[15px] ${i === sel ? "bg-sky-400/10 text-slate-50" : "text-slate-300"}`}
              >
                <span className="truncate">{c.label}</span>
                <span className="shrink-0 font-mono text-[13px] text-[var(--mute)]">{c.hint}</span>
              </button>
            </li>
          ))}
          {!shown.length && <li className="px-5 py-6 text-center text-[15px] text-[var(--mute)]">No match.</li>}
        </ul>
        <p className="border-t border-white/[0.07] px-5 py-2 font-mono text-[13px] text-[var(--mute)]">↑↓ move · Enter run · Esc close · on Leads: J/K move, A approve, H hold, E open</p>
      </div>
    </div>
  );
}
