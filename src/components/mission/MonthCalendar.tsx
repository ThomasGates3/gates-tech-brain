"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isOverdue, monthGrid, monthLabel, shiftMonth, type Task } from "@/lib/mission/model";
import { COPY, LANE_DOT } from "./chips";
import { TaskCard, type Person } from "./TaskCard";
import { TaskModal } from "./TaskModal";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Month grid by due date, with a list of tasks that have no due date. */
export function MonthCalendar({ month, tasks, people, today }: { month: string; tasks: Task[]; people: Person[]; today: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Task | null>(null);
  const { weeks, undated } = monthGrid(month, tasks, today);
  const nav = "min-h-[36px] inline-flex items-center rounded-full bg-white/5 px-3.5 text-[12px] text-slate-300 hover:text-slate-100";

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]" data-testid="mc-calendar">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <a href={`/mission?view=calendar&month=${shiftMonth(month, -1)}`} data-testid="mc-prev" className={nav}>Previous</a>
          <h2 className="min-w-[150px] text-center text-[14px] font-semibold">{monthLabel(month)}</h2>
          <a href={`/mission?view=calendar&month=${shiftMonth(month, 1)}`} data-testid="mc-next" className={nav}>Next</a>
        </div>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.06]">
          {DAYS.map((d) => <div key={d} className="bg-black/60 px-2 py-1 text-[10px] uppercase tracking-wider text-slate-500">{d}</div>)}
          {weeks.flat().map((c) => (
            <div key={c.date} data-testid={`mc-day-${c.date}`} className={`min-h-[84px] p-1.5 ${c.inMonth ? "bg-black/40" : "bg-black/70 opacity-50"} ${c.isToday ? "outline outline-2 -outline-offset-2 outline-[#00e5ff]" : ""}`}>
              <p className="font-mono text-[10px] text-slate-500">{Number(c.date.slice(8))}</p>
              <div className="mt-1 space-y-1">
                {c.tasks.map((t) => (
                  <button key={t.id} type="button" onClick={() => setEditing(t)} title={t.title} className={`flex w-full items-center gap-1 truncate rounded bg-white/5 px-1 py-0.5 text-left text-[10px] hover:bg-white/10 ${isOverdue(t, today) ? "text-[#ff7a45]" : "text-slate-200"}`}>
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${LANE_DOT[t.lane]}`} />
                    <span className="truncate">{t.title}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <aside aria-label={COPY.noDueDate}>
        <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-slate-400">{COPY.noDueDate}</h2>
        <div className="space-y-2" data-testid="mc-undated">
          {undated.map((t) => <TaskCard key={t.id} task={t} people={people} today={today} onOpen={setEditing} />)}
          {undated.length === 0 && <p className="text-[12px] text-slate-500">Every open task has a date.</p>}
        </div>
      </aside>
      {editing && <TaskModal key={editing.id} task={editing} people={people} onClose={() => setEditing(null)} onSaved={() => router.refresh()} />}
    </div>
  );
}
