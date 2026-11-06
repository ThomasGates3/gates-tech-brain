/**
 * Approval gate — human sign-off for write/destructive connector calls, in Neon.
 *
 * Nothing waits: the Tool Router saves a pending row and tells the agent it's
 * waiting on Thomas. When he approves, POST /api/approvals/[id] runs the stored
 * call. Claiming a row is atomic, so a call can run at most once. Rows nobody
 * decides expire after APPROVAL_TTL_HOURS and can never run.
 */
import { randomUUID } from "crypto";
import { isDeepStrictEqual } from "node:util";
import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { approvals } from "@/db/schema";
import type { ApprovalDecision, ApprovalRequest, ToolCall } from "@/lib/types";

export const APPROVAL_TTL_HOURS = 24;
const TTL_MS = APPROVAL_TTL_HOURS * 60 * 60 * 1000;
const oldestLive = () => new Date(Date.now() - TTL_MS).toISOString();

export async function listPending(): Promise<ApprovalRequest[]> {
  const rows = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.resolved, false), gt(approvals.requestedAt, oldestLive())))
    .orderBy(asc(approvals.requestedAt));
  return rows.map((r) => ({
    id: r.id,
    toolCall: r.toolCall as ToolCall,
    reason: r.reason,
    requestedAt: r.requestedAt,
    expiresAt: new Date(new Date(r.requestedAt).getTime() + TTL_MS).toISOString(),
  }));
}

/** Save a pending approval. An identical call already waiting is reused, so a retry can't queue the action twice. */
export async function requestApproval(call: ToolCall, reason: string): Promise<{ id: string; created: boolean }> {
  const same = (await listPending()).find(
    (p) => p.toolCall.connectorId === call.connectorId && p.toolCall.toolName === call.toolName && isDeepStrictEqual(p.toolCall.args, call.args)
  );
  if (same) return { id: same.id, created: false };
  const id = `apr_${randomUUID()}`;
  await db.insert(approvals).values({ id, toolCall: call, reason, requestedAt: new Date().toISOString() });
  return { id, created: true };
}

/** Record a decision. Returns the call only for the one caller who claimed a live, undecided row. */
export async function resolveApproval(id: string, decision: ApprovalDecision, decidedBy: string): Promise<ToolCall | null> {
  const [row] = await db
    .update(approvals)
    .set({ resolved: true, decision, decidedBy })
    .where(and(eq(approvals.id, id), eq(approvals.resolved, false), gt(approvals.requestedAt, oldestLive())))
    .returning({ toolCall: approvals.toolCall });
  return row ? (row.toolCall as ToolCall) : null;
}
