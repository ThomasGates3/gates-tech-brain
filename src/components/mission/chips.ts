/** One color map for Mission Control columns, lanes and priority. Filled chips, no orange. */
import type { Column, Lane, Priority } from "@/lib/mission/model";

export const COLUMN_CHIP: Record<Column, string> = {
  not_yet: "bg-slate-600 text-white",
  this_week: "bg-[#00b7ff] text-black",
  in_progress: "bg-[#00e5ff] text-black",
  waiting_thomas: "bg-[#ff7a45] text-black",
  done: "bg-emerald-400 text-black",
};

export const LANE_CHIP: Record<Lane, string> = {
  gates: "bg-[#00e5ff] text-black",
  twin: "bg-[#7c3aed] text-white",
  fleet: "bg-[#a0c3ec] text-black",
  govcon: "bg-teal-400 text-black",
  career: "bg-pink-400 text-black",
};

export const LANE_DOT: Record<Lane, string> = {
  gates: "bg-[#00e5ff]",
  twin: "bg-[#7c3aed]",
  fleet: "bg-[#a0c3ec]",
  govcon: "bg-teal-400",
  career: "bg-pink-400",
};

export const PRIORITY_CHIP: Record<Priority, string> = {
  high: "border border-[#ff7a45] text-[#ff7a45]",
  med: "border border-slate-300 text-slate-300",
  low: "border border-slate-500 text-slate-500",
};

/** Plain-English UI strings shared by the Mission components. */
export const COPY = {
  empty: "No tasks yet. Add one, or ask a bot to.",
  newTask: "New task",
  waitingTitle: "Waiting on Thomas",
  waitingEmpty: "Nothing is waiting on you.",
  handBack: "Done, hand it back",
  markDone: "Mark done",
  moveTo: "Move to",
  addNote: "Add a note",
  history: "History",
  unassigned: "Unassigned",
  noDueDate: "No due date",
  askNeeded: "What do you need from Thomas?",
} as const;
