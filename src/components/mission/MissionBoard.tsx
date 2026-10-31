"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { callTool } from "@/lib/ux/tools";
import { COLUMNS, COLUMN_LABEL, boardColumns, placeRank, type Column, type Task } from "@/lib/mission/model";
import { COLUMN_CHIP, COPY } from "./chips";
import { TaskCard, type Person } from "./TaskCard";
import { TaskModal } from "./TaskModal";

type Place = { beforeId?: string; afterId?: string };
const sortedPeers = (tasks: Task[], column: Column, skip: string) => tasks.filter((t) => t.column === column && t.id !== skip).sort((a, b) => a.rank - b.rank);

/** Kanban board with a pinned Waiting on Thomas strip. Native drag and drop plus a Move to menu for touch and keyboard. */
export function MissionBoard({ tasks: initial, people, today }: { tasks: Task[]; people: Person[]; today: string }) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initial);
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);
  useEffect(() => { const t = setTimeout(() => setTasks(initial), 0); return () => clearTimeout(t); }, [initial]);

  const cols = boardColumns(tasks);
  const waiting = cols.waiting_thomas;

  async function move(id: string, to: Column, place: Place = {}, note?: string) {
    const before = tasks;
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    setErr(null);
    try {
      let ask = task.ask;
      if (to === "waiting_thomas" && !ask?.trim()) {
        ask = (typeof window !== "undefined" ? window.prompt(COPY.askNeeded) : null)?.trim() ?? "";
        if (!ask) return;
        await callTool("brain_task_update", { task_id: id, ask });
      }
      const spot = placeRank(sortedPeers(tasks, to, id), place);
      setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, column: to, ask, rank: spot?.rank ?? t.rank } : t)));
      await callTool("brain_task_move", { task_id: id, column: to, before_id: place.beforeId, after_id: place.afterId, note });
      router.refresh();
    } catch (e) {
      setTasks(before);
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  const dropOnCard = (to: Column) => (target: Task, e: React.DragEvent) => {
    const id = dragId.current ?? e.dataTransfer.getData("text/plain");
    dragId.current = null;
    if (!id || id === target.id) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    void move(id, to, e.clientY < r.top + r.height / 2 ? { beforeId: target.id } : { afterId: target.id });
  };
  const dropOnColumn = (to: Column) => (e: React.DragEvent) => {
    e.preventDefault();
    const id = dragId.current ?? e.dataTransfer.getData("text/plain");
    dragId.current = null;
    if (id) void move(id, to);
  };

  const moveMenu = (t: Task) => (
    <label className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
      {COPY.moveTo}
      <select
        aria-label={`${COPY.moveTo} for ${t.title}`}
        value={t.column}
        onChange={(e) => void move(t.id, e.target.value as Column)}
        className="min-h-[28px] rounded border border-white/10 bg-black/40 px-1 text-[11px] text-slate-300"
      >
        {COLUMNS.map((c) => <option key={c} value={c}>{COLUMN_LABEL[c]}</option>)}
      </select>
    </label>
  );

  return (
    <div className="space-y-4" data-testid="mc-board">
      <div className="flex items-center justify-between">
        {err ? <p role="alert" className="text-[12px] text-red-400" data-testid="mc-error">{err}</p> : <span />}
        <button type="button" data-testid="mc-new" onClick={() => setCreating(true)} className="min-h-[36px] rounded-full bg-[var(--accent)] px-4 text-[12px] font-medium text-black">{COPY.newTask}</button>
      </div>

      <section aria-label={COPY.waitingTitle} data-testid="mc-waiting" className={`rounded-xl border p-3 ${waiting.length ? "border-[#ff7a45]/60 bg-[#ff7a45]/10" : "border-white/[0.06] bg-black/30"}`}>
        <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] ${COLUMN_CHIP.waiting_thomas}`}>{COPY.waitingTitle}</span>
          <span data-testid="mc-waiting-count" className="font-mono text-[#ff7a45]">{waiting.length}</span>
        </h2>
        {waiting.length === 0 ? <p className="text-[12px] text-slate-500">{COPY.waitingEmpty}</p> : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {waiting.map((t) => (
              <TaskCard key={t.id} task={t} people={people} today={today} onOpen={setEditing}>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => void move(t.id, "in_progress", {}, "Thomas cleared this")} className="min-h-[32px] rounded-md bg-[var(--accent)] px-2.5 text-[11px] font-medium text-black">{COPY.handBack}</button>
                  <button type="button" onClick={() => void move(t.id, "done")} className="min-h-[32px] rounded-md border border-white/10 px-2.5 text-[11px] text-slate-200">{COPY.markDone}</button>
                </div>
              </TaskCard>
            ))}
          </div>
        )}
      </section>

      <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-5">
        {COLUMNS.map((c) => (
          <section
            key={c}
            aria-label={COLUMN_LABEL[c]}
            data-testid={`mc-col-${c}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={dropOnColumn(c)}
            className="min-h-[120px] rounded-xl border border-white/[0.06] bg-black/30 p-2"
          >
            <h2 className="mb-2 flex items-center justify-between">
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${COLUMN_CHIP[c]}`}>{COLUMN_LABEL[c]}</span>
              <span className="font-mono text-[11px] text-slate-500">{cols[c].length}</span>
            </h2>
            <div className="space-y-2">
              {cols[c].map((t) => (
                <TaskCard key={t.id} task={t} people={people} today={today} onOpen={setEditing} draggable onDragStart={(x) => { dragId.current = x.id; }} onDragEnd={() => { dragId.current = null; }} onDropOn={dropOnCard(c)}>
                  {moveMenu(t)}
                </TaskCard>
              ))}
            </div>
          </section>
        ))}
      </div>

      {(creating || editing) && (
        <TaskModal
          key={editing?.id ?? "new"}
          task={editing}
          people={people}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}
