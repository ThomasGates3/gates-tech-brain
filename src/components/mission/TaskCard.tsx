"use client";

import { Link2, Repeat } from "lucide-react";
import { LANE_LABEL, PRIORITY_LABEL, isOverdue, type Task } from "@/lib/mission/model";
import { LANE_CHIP, PRIORITY_CHIP } from "./chips";

export interface Person { id: string; label: string }
export const labelOf = (people: Person[], id: string | null) => (id ? people.find((p) => p.id === id)?.label ?? id : "Unassigned");

/** One card: title, lane sticker, priority, assignee, due date, repeat icon, link count. */
export function TaskCard({ task, people, today, onOpen, draggable, onDragStart, onDragEnd, onDropOn, children }: {
  task: Task; people: Person[]; today: string; onOpen: (t: Task) => void;
  draggable?: boolean; onDragStart?: (t: Task) => void; onDragEnd?: () => void;
  onDropOn?: (t: Task, e: React.DragEvent) => void; children?: React.ReactNode;
}) {
  const late = isOverdue(task, today);
  return (
    <div
      data-testid={`mc-card-${task.id}`}
      draggable={draggable}
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", task.id); e.dataTransfer.effectAllowed = "move"; onDragStart?.(task); }}
      onDragEnd={() => onDragEnd?.()}
      onDragOver={(e) => { if (onDropOn) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } }}
      onDrop={(e) => { if (onDropOn) { e.preventDefault(); e.stopPropagation(); onDropOn(task, e); } }}
      className="rounded-lg border border-white/[0.08] bg-[var(--panel)]/80 p-2.5 hover:border-[var(--accent)]/50"
    >
      <button type="button" onClick={() => onOpen(task)} className="block w-full text-left">
        <p className="text-[13px] font-medium leading-snug text-slate-100">{task.title}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${LANE_CHIP[task.lane]}`}>{LANE_LABEL[task.lane]}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] ${PRIORITY_CHIP[task.priority]}`}>{PRIORITY_LABEL[task.priority]}</span>
          <span className="text-[11px] text-slate-400">{labelOf(people, task.agent)}</span>
          {task.dueDate && <span className={`font-mono text-[10px] ${late ? "text-[#ff7a45]" : "text-slate-500"}`}>{late ? "Overdue " : "Due "}{task.dueDate}</span>}
          {task.recurring && <Repeat size={12} className="text-slate-400" aria-label="Repeats" />}
          {task.links.length > 0 && <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-500"><Link2 size={11} aria-hidden />{task.links.length}</span>}
        </div>
        {task.ask && task.column === "waiting_thomas" && <p className="mt-1.5 text-[12px] text-slate-300">{task.ask}</p>}
      </button>
      {children}
    </div>
  );
}
