"use client";

import { useCallback, useEffect, useState } from "react";
import { callTool } from "@/lib/ux/tools";
import { COLUMNS, COLUMN_LABEL, LANES, LANE_LABEL, PRIORITIES, PRIORITY_LABEL, describeEvent, formatET, type Column, type Lane, type Priority, type Task, type TaskEvent } from "@/lib/mission/model";
import { COPY } from "./chips";
import { labelOf, type Person } from "./TaskCard";

type View = Task & { history: TaskEvent[] };

const field = "w-full rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 text-[13px] text-slate-100 outline-none focus:border-[var(--accent)]/60";
const lbl = "block text-[11px] text-slate-400";
const btn = "min-h-[34px] rounded-md px-3 text-[12px] font-medium disabled:opacity-40";

/** Create or edit one task, with notes and the timestamped history. Saves go through the Brain tools. */
export function TaskModal({ task, people, defaultColumn, onClose, onSaved }: {
  task: Task | null; people: Person[]; defaultColumn?: Column; onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [lane, setLane] = useState<Lane>(task?.lane ?? "gates");
  const [assignee, setAssignee] = useState(task?.agent ?? "");
  const [priority, setPriority] = useState<Priority>(task?.priority ?? "med");
  const [column, setColumn] = useState<Column>(task?.column ?? defaultColumn ?? "not_yet");
  const [due, setDue] = useState(task?.dueDate ?? "");
  const [recurring, setRecurring] = useState(task?.recurring ?? false);
  const [ask, setAsk] = useState(task?.ask ?? "");
  const [links, setLinks] = useState(task?.links.map((l) => `${l.label} | ${l.url}`).join("\n") ?? "");
  const [note, setNote] = useState("");
  const [history, setHistory] = useState<TaskEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!task) return;
    try { setHistory((await callTool<View>("brain_task_list", { task_id: task.id })).history); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [task]);
  useEffect(() => { const t = setTimeout(() => void loadHistory(), 0); return () => clearTimeout(t); }, [loadHistory]);

  const parseLinks = () => links.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [label, ...rest] = l.includes("|") ? l.split("|") : ["Link", l];
    return { label: label.trim() || "Link", url: rest.join("|").trim() };
  });

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(null);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  const save = () => run(async () => {
    const common = { title, lane, priority, recurring, links: parseLinks() };
    if (!task) {
      await callTool("brain_task_create", { ...common, assignee: assignee || undefined, due_date: due || undefined, ask: ask || undefined, column, note: note || undefined });
    } else {
      await callTool("brain_task_update", { ...common, task_id: task.id, assignee: assignee || null, due_date: due || null, ask: ask || null });
      if (column !== task.column) await callTool("brain_task_move", { task_id: task.id, column });
    }
    onSaved(); onClose();
  });

  const addNote = () => run(async () => {
    if (!task) return;
    await callTool("brain_task_note", { task_id: task.id, note });
    setNote(""); await loadHistory(); onSaved();
  });

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-3" role="dialog" aria-modal="true" aria-label={task ? "Edit task" : "New task"} data-testid="mc-modal">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-white/10 bg-[var(--panel)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">{task ? "Edit task" : COPY.newTask}</h2>
          <button type="button" onClick={onClose} className="text-[12px] text-slate-400 hover:text-slate-100">Close</button>
        </div>
        <div className="space-y-3">
          <label className={lbl}>Title<input data-testid="mc-title" className={field} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className={lbl}>Lane<select className={field} value={lane} onChange={(e) => setLane(e.target.value as Lane)}>{LANES.map((l) => <option key={l} value={l}>{LANE_LABEL[l]}</option>)}</select></label>
            <label className={lbl}>Owner<select className={field} value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">{COPY.unassigned}</option>{people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
            <label className={lbl}>Priority<select className={field} value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</select></label>
            <label className={lbl}>Column<select className={field} value={column} onChange={(e) => setColumn(e.target.value as Column)}>{COLUMNS.map((c) => <option key={c} value={c}>{COLUMN_LABEL[c]}</option>)}</select></label>
            <label className={lbl}>Due date<input type="date" className={field} value={due} onChange={(e) => setDue(e.target.value)} /></label>
            <label className="flex items-end gap-2 pb-2 text-[12px] text-slate-300"><input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />Repeats</label>
          </div>
          <label className={lbl}>{COPY.askNeeded} (needed for Waiting on Thomas)<textarea className={field} rows={2} maxLength={500} value={ask} onChange={(e) => setAsk(e.target.value)} /></label>
          <label className={lbl}>Links, one per line as: Label | https://...<textarea className={field} rows={2} value={links} onChange={(e) => setLinks(e.target.value)} /></label>
          {!task && <label className={lbl}>First note (optional)<textarea className={field} rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} /></label>}
          {err && <p role="alert" className="text-[12px] text-red-400" data-testid="mc-error">{err}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className={`${btn} border border-white/10 text-slate-300`}>Cancel</button>
            <button type="button" data-testid="mc-save" disabled={busy || !title.trim()} onClick={save} className={`${btn} bg-[var(--accent)] text-black`}>{busy ? "Saving..." : task ? "Save changes" : "Add task"}</button>
          </div>
        </div>
        {task && (
          <div className="mt-5 border-t border-white/[0.08] pt-4">
            <label className={lbl}>{COPY.addNote}<textarea data-testid="mc-note" className={field} rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} /></label>
            <button type="button" disabled={busy || !note.trim()} onClick={addNote} className={`${btn} mt-2 border border-white/10 text-slate-200`}>Add note</button>
            <h3 className="mb-2 mt-4 text-[12px] font-semibold uppercase tracking-wider text-slate-400">{COPY.history}</h3>
            <ul className="space-y-1.5" data-testid="mc-history">
              {history.map((e) => (
                <li key={e.id} className="text-[12px] text-slate-300">
                  <span className="font-mono text-slate-500">{formatET(e.at)}</span> · {labelOf(people, e.actor)} · {describeEvent(e, (id) => labelOf(people, id))}
                </li>
              ))}
              {history.length === 0 && <li className="text-[12px] text-slate-500">Loading history...</li>}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
