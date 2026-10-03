import { connection } from "next/server";
import { PageShell } from "@/components/deck/PageShell";
import { getRoadmap } from "@/lib/roadmap";

export const metadata = { title: "Money roadmap · Gates Tech Brain" };

const STATUS_STYLE = { done: "bg-emerald-400/10 text-emerald-300", now: "bg-[var(--accent)] text-black", later: "bg-white/5 text-slate-400" };

export default async function RoadmapPage() {
  await connection();
  const r = await getRoadmap();
  const n = r.numbers;
  const tiles: [string, string, string, boolean][] = [
    ["PASS waiting on Thomas", String(n.pass_waiting_approve), "/leads?status=PASS", n.pass_waiting_approve > 0],
    ["Approved, not sent", String(n.approved_unsent), "/leads?status=approved", n.approved_unsent > 0],
    ["Field emails sent", String(n.field_sent_all_time), "/leads?status=sent", false],
    ["Warm-up", n.warmup, "/", n.warmup === "blocked"],
  ];
  return (
    <PageShell title="Money roadmap" subtitle="From ready to mail to the first paid client. Steps only move forward, in order.">
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-4 xl:sticky xl:top-4 xl:order-2">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2" data-testid="roadmap-numbers">
          {tiles.map(([label, value, href, hot]) => (
            <a key={label} href={href} data-testid={`rm-num-${label.split(/[ ,]/)[0].toLowerCase()}`} className={`min-h-[44px] rounded-lg border p-2.5 hover:border-[var(--accent)]/60 ${hot ? "border-[var(--accent)]/50 bg-[var(--accent)]/10" : "border-white/[0.06] bg-black/30"}`}>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
              <p className={`mt-1 font-mono text-[20px] leading-none ${hot ? "text-[var(--accent)]" : "text-slate-100"}`}>{value}</p>
            </a>
          ))}
        </div>
        {(
          <div data-testid="roadmap-history" className="rounded-xl border border-white/[0.06] bg-black/30 p-3">
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Changes</p>
            {r.history.length === 0 && <p className="text-[12px] text-slate-500">No changes yet. Bots and Brain events show here.</p>}
            <ul className="space-y-1 text-[12px] text-slate-400">
              {r.history.map((h, i) => <li key={i}>{h.at} · {h.agent} · {r.steps.find((x) => x.id === h.step)?.name} is {h.status}{h.note ? ` · ${h.note}` : ""}</li>)}
            </ul>
          </div>
        )}
        </div>
        <ol className="space-y-2 xl:order-1" data-testid="roadmap-steps">
          {r.steps.map((s, i) => {
            const now = s.id === r.now;
            return (
              <li key={s.id} data-testid={`rm-step-${s.id}`} data-status={s.status}
                className={`rounded-xl border p-3 ${now ? "border-[var(--accent)]/60 bg-[var(--accent)]/[0.07]" : "border-white/[0.06] bg-[var(--panel)]/60"} ${s.status === "done" ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-slate-500">{i + 1}.</span>
                  <span className={`text-[14px] font-medium ${now ? "text-[var(--accent)]" : "text-slate-100"}`}>{s.name}</span>
                  <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ${STATUS_STYLE[s.status]}`}>{s.status}</span>
                  <span className="ml-auto font-mono text-[10px] text-slate-500">{s.owner}{s.done_at ? ` · done ${s.done_at}` : ""}</span>
                </div>
                <p className="mt-1 text-[13px] text-slate-300">{s.done_means}</p>
                {s.note && <p className="mt-1 text-[12px] text-slate-500">{s.note}</p>}
              </li>
            );
          })}
        </ol>
      </div>
    </PageShell>
  );
}
