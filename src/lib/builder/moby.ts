/**
 * Moby dev-agent dispatcher — the Brain spins up a coding agent (Claude Code)
 * to do real development tasks on the Moby repo.
 *
 * Safety:
 *  - Runs on a dedicated branch so main is never touched and work is revertible.
 *  - Gated behind MOBY_DEV_ENABLED=true. Without it, returns a plan (dry run).
 *  - Bounded by a timeout. Output is captured and returned.
 */
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import audit from "@/lib/audit";

const execAsync = promisify(exec);
const MOBY_DIR = process.env.MOBY_REPO_PATH ?? "/Users/tg3/dev/moby";
const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";

export interface DevTaskResult {
  status: "completed" | "planned" | "error";
  task: string;
  branch?: string;
  output: string;
  error?: string;
}

async function sh(cmd: string, timeout = 240_000) {
  return execAsync(cmd, { cwd: MOBY_DIR, timeout, maxBuffer: 12 * 1024 * 1024 });
}

export async function dispatchMobyDevTask(task: string): Promise<DevTaskResult> {
  if (!task?.trim()) return { status: "error", task, output: "", error: "Empty task" };
  if (!existsSync(MOBY_DIR)) {
    return { status: "error", task, output: "", error: `Moby repo not found at ${MOBY_DIR} (set MOBY_REPO_PATH)` };
  }

  const branch = `brain/${Date.now()}`;
  const enabled = process.env.MOBY_DEV_ENABLED === "true";

  if (!enabled) {
    return {
      status: "planned",
      task,
      branch,
      output:
        `Armed but not executed. Set MOBY_DEV_ENABLED=true to let the agent run.\n` +
        `Plan: create branch ${branch} in ${MOBY_DIR}, run a Claude Code agent to: ${task}`,
    };
  }

  try {
    // Ensure version control so the agent's work is isolated + revertible.
    await sh(`git rev-parse --is-inside-work-tree 2>/dev/null || (git init -q && git add -A && git commit -qm "baseline before brain agent")`, 60_000).catch(() => {});
    await sh(`git checkout -b ${branch} 2>/dev/null || git checkout -B ${branch}`, 30_000).catch(() => {});

    // Spin up the coding agent headlessly, auto-accepting its edits.
    const { stdout, stderr } = await sh(
      `${CLAUDE_BIN} -p ${JSON.stringify(task)} --permission-mode acceptEdits`,
      Number(process.env.MOBY_DEV_TIMEOUT_MS ?? 300_000)
    );

    audit.record({ action: "job_run", actor: "moby-dev", target: branch, detail: { task, chars: (stdout || "").length } });
    return { status: "completed", task, branch, output: (stdout || stderr || "(no output)").slice(0, 6000) };
  } catch (e) {
    const error = e instanceof Error ? e.message : "dispatch failed";
    audit.record({ action: "job_run", actor: "moby-dev", target: branch, detail: { task, error } });
    return { status: "error", task, branch, output: "", error };
  }
}
