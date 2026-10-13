"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { COLUMNS, COLUMN_LABEL, byAgent, type Task } from "@/lib/mission/model";
import { COLUMN_CHIP, COPY } from "./chips";
import { TaskCard, labelOf, type Person } from "./TaskCard";
import { TaskModal } from "./TaskModal";

/** Tasks grouped by owner. Clicking an owner opens a list of their cards (deep link: ?view=agents&agent=lynx). */
export function AgentView({ tasks, people, today, selected }: { tasks: Task[]; people: Person[]; today: string; selected: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Task | null>(null);
  const groups = byAgent(tasks);
  const open = selected ? groups.find((g) => (g.agent ?? "none") === selected) : null;
  const href = (a: string | null) => `/mission?view=agents&agent=${a ?? "none"}`;

  return (
    <div data-testid="mc-agents" className="space-y-2">
      {groups.map((g) => (
        <a key={g.agent ?? "none"} href={href(g.agent)} data-testid={`mc-agent-${g.agent ?? "none"}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] bg-[var(--panel)]/60 p-3 hover:border-[var(--accent)]/50">
          <span className="min-w-[120px] text-[14px] font-medium text-slate-100">{labelOf(people, g.agent)}</span>
          <span className="font-mono text-[11px] text-slate-500">{g.open} open</span>
          <span className="flex flex-wrap gap-1.5">
            {COLUMNS.map((c) => {
              const n = g.tasks.filter((t) => t.column === c).length;
              return n ? <span key={c} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${COLUMN_CHIP[c]}`}>{COLUMN_LABEL[c]} {n}</span> : null;
            })}
          </span>
        </a>
      ))}

      {open && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-3" role="dialog" aria-modal="true" aria-label={`${labelOf(people, open.agent)} tasks`} data-testid="mc-agent-modal">
          <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl border border-white/10 bg-[var(--panel)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">{labelOf(people, open.agent)}</h2>
              <a href="/mission?view=agents" className="text-[12px] text-slate-400 hover:text-slate-100">Close</a>
            </div>
            <div className="space-y-2">
              {open.tasks.map((t) => (
                <div key={t.id}>
                  <span className={`mb-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${COLUMN_CHIP[t.column]}`}>{COLUMN_LABEL[t.column]}</span>
                  <TaskCard task={t} people={people} today={today} onOpen={setEditing} />
                </div>
              ))}
              {open.tasks.length === 0 && <p className="text-[12px] text-slate-500">{COPY.empty}</p>}
            </div>
          </div>
        </div>
      )}
      {editing && <TaskModal key={editing.id} task={editing} people={people} onClose={() => setEditing(null)} onSaved={() => router.refresh()} />}
    </div>
  );
}
