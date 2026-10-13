import { connection } from "next/server";
import { PageShell } from "@/components/deck/PageShell";
import { MissionBoard } from "@/components/mission/MissionBoard";
import { AgentView } from "@/components/mission/AgentView";
import { MonthCalendar } from "@/components/mission/MonthCalendar";
import { COPY } from "@/components/mission/chips";
import { AGENTS } from "@/lib/agents";
import { isMonth, todayNY, type Task } from "@/lib/mission/model";
import { listTasks } from "@/lib/mission/service";
import { dbStore } from "@/lib/mission/db-store";

export const metadata = { title: "Mission Control · Gates Tech Brain" };

const TAB = "min-h-[36px] inline-flex items-center rounded-full px-3.5 text-[12px]";
const VIEWS = [["board", "Board"], ["agents", "By agent"], ["calendar", "Calendar"]] as const;

export default async function MissionPage({ searchParams }: { searchParams: Promise<{ view?: string; agent?: string; month?: string }> }) {
  await connection();
  const sp = await searchParams;
  const view = VIEWS.some(([v]) => v === sp.view) ? (sp.view as (typeof VIEWS)[number][0]) : "board";
  const today = todayNY();
  const month = sp.month && isMonth(sp.month) ? sp.month : today.slice(0, 7);
  const people = [{ id: "thomas", label: "Thomas" }, ...AGENTS.filter((a) => a.id !== "thomas").map((a) => ({ id: a.id, label: a.label }))];

  let tasks: Task[] = [];
  let failed = false;
  try {
    tasks = (await listTasks(dbStore(), { includeDone: true, limit: 1000 })).tasks;
  } catch {
    failed = true; // tables not created yet, or the database is unreachable
  }

  const tabs = (
    <nav className="mb-4 flex gap-1.5" aria-label="Mission Control views">
      {VIEWS.map(([v, label]) => (
        <a key={v} href={v === "board" ? "/mission" : `/mission?view=${v}`} data-testid={`mc-tab-${v}`} aria-current={view === v ? "page" : undefined} className={`${TAB} ${view === v ? "bg-[var(--accent)] text-black" : "bg-white/5 text-slate-400 hover:text-slate-200"}`}>{label}</a>
      ))}
    </nav>
  );

  return (
    <PageShell title="Mission Control" subtitle="Every task, who has it, and what is waiting on you.">
      {tabs}
      {failed ? (
        <p className="text-[13px] text-slate-500" data-testid="mc-empty">{COPY.empty}</p>
      ) : view === "agents" ? (
        <AgentView tasks={tasks} people={people} today={today} selected={sp.agent ?? null} />
      ) : view === "calendar" ? (
        <MonthCalendar month={month} tasks={tasks} people={people} today={today} />
      ) : (
        <>
          {tasks.length === 0 && <p className="mb-3 text-[13px] text-slate-500" data-testid="mc-empty">{COPY.empty}</p>}
          <MissionBoard tasks={tasks} people={people} today={today} />
        </>
      )}
    </PageShell>
  );
}
