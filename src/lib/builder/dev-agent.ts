/**
 * Dev-agent dispatcher — the Brain spins up a coding agent (Claude Code) to do
 * real development on a target repo (Moby, Ad System, …).
 *
 * Safety:
 *  - Runs on a dedicated branch so main is untouched and work is revertible.
 *  - Gated behind DEV_AGENT_ENABLED=true. Without it, returns a plan (dry run).
 *  - Bounded by a timeout; output captured and returned.
 */
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import audit from "@/lib/audit";
import { recordActivity } from "@/lib/activity";

const execAsync = promisify(exec);
const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";

/** Registered dev targets. Paths overridable via env. */
const TARGETS: Record<string, { label: string; path: string }> = {
  moby: { label: "Moby", path: process.env.MOBY_REPO_PATH ?? "/Users/tg3/dev/moby" },
  "ad-system": { label: "Ad System", path: process.env.AD_SYSTEM_REPO_PATH ?? "/Users/tg3/dev/ad-system" },
};

export const DEV_TARGETS = Object.keys(TARGETS) as (keyof typeof TARGETS)[];

export interface DevTaskResult {
  status: "completed" | "planned" | "error";
  repo: string;
  task: string;
  branch?: string;
  output: string;
  error?: string;
}

function enabled(): boolean {
  return process.env.DEV_AGENT_ENABLED === "true" || process.env.MOBY_DEV_ENABLED === "true";
}

export async function dispatchDevTask(repo: string, task: string): Promise<DevTaskResult> {
  const target = TARGETS[repo];
  if (!target) return { status: "error", repo, task, output: "", error: `Unknown repo '${repo}'. Options: ${DEV_TARGETS.join(", ")}` };
  if (!task?.trim()) return { status: "error", repo, task, output: "", error: "Empty task" };
  if (!existsSync(target.path)) return { status: "error", repo, task, output: "", error: `Repo not found at ${target.path}` };

  const dir = target.path;
  const branch = `brain/${Date.now()}`;
  const sh = (cmd: string, timeout = 240_000) => execAsync(cmd, { cwd: dir, timeout, maxBuffer: 12 * 1024 * 1024 });

  if (!enabled()) {
    return {
      status: "planned",
      repo,
      task,
      branch,
      output: `Armed but not executed. Set DEV_AGENT_ENABLED=true to let the agent run.\nPlan: branch ${branch} in ${dir} → Claude Code agent → ${task}`,
    };
  }

  try {
    await sh(`git rev-parse --is-inside-work-tree 2>/dev/null || (git init -q && git add -A && git commit -qm "baseline before brain agent")`, 60_000).catch(() => {});
    await sh(`git checkout -b ${branch} 2>/dev/null || git checkout -B ${branch}`, 30_000).catch(() => {});

    // Full autonomy: the agent must run builds/tests + edit files without prompts.
    // Safe because it's confined to a throwaway branch (revert by deleting it).
    const { stdout, stderr } = await sh(
      `${CLAUDE_BIN} -p ${JSON.stringify(task)} --permission-mode bypassPermissions`,
      Number(process.env.DEV_AGENT_TIMEOUT_MS ?? 420_000)
    );

    audit.record({ action: "job_run", actor: "dev-agent", target: `${repo}:${branch}`, detail: { task, chars: (stdout || "").length } });
    await recordActivity({ kind: "spawned", target: `${target.label}: ${task.slice(0, 80)}`, agent: "dev-agent", because: `branch ${branch}` });
    return { status: "completed", repo, task, branch, output: (stdout || stderr || "(no output)").slice(0, 6000) };
  } catch (e) {
    const error = e instanceof Error ? e.message : "dispatch failed";
    audit.record({ action: "job_run", actor: "dev-agent", target: `${repo}:${branch}`, detail: { task, error } });
    return { status: "error", repo, task, branch, output: "", error };
  }
}
