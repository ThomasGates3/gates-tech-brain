/**
 * Approval Gate — human-in-the-loop for write/destructive tool calls.
 *
 * Storage: in-memory map (survives the request cycle on a long-running server).
 * DB-backed path: persist ApprovalRequest rows to Neon and poll/subscribe —
 * swap `store` below with DB calls when the orchestrator agent wires the DB.
 *
 * The Tool Router calls `requestApproval` before executing any tool with
 * risk !== "read". It then awaits `waitForResolution` (with a timeout).
 */

import { randomUUID } from "crypto";
import type { ApprovalRequest, ApprovalResolution, ApprovalDecision, ToolCall } from "@/lib/types";

export type { ApprovalRequest, ApprovalResolution };

// ── In-memory store ────────────────────────────────────────────────────────

interface StoredApproval {
  request: ApprovalRequest;
  resolution?: ApprovalResolution;
  resolve?: (r: ApprovalResolution) => void;
}

const store = new Map<string, StoredApproval>();

// ── Public interface ────────────────────────────────────────────────────────

export interface ApprovalGate {
  /**
   * Create an approval request for a risky tool call.
   * The Tool Router should surface this to the deck via SSE (AgentEvent approval_request).
   */
  requestApproval(toolCall: ToolCall, reason?: string): Promise<ApprovalRequest>;

  /**
   * Record a human decision. Called by the POST /api/approvals/[id] route.
   */
  resolveApproval(resolution: ApprovalResolution): Promise<void>;

  /**
   * Wait for a resolution (poll every 500 ms, reject after `timeoutMs`).
   * Returns the resolution or throws on timeout.
   */
  waitForResolution(requestId: string, timeoutMs?: number): Promise<ApprovalResolution>;

  /** Retrieve a pending request by id (for the approval UI). */
  getRequest(requestId: string): ApprovalRequest | undefined;

  /** All pending (unresolved) approval requests. */
  listPending(): ApprovalRequest[];
}

const approvals: ApprovalGate = {
  async requestApproval(toolCall: ToolCall, reason?: string): Promise<ApprovalRequest> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 min TTL
    const request: ApprovalRequest = {
      id: randomUUID(),
      toolCall,
      reason: reason ?? `Tool "${toolCall.toolName}" has risk level "${toolCall.risk}" and requires approval.`,
      requestedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
    store.set(request.id, { request });
    return request;
  },

  async resolveApproval(resolution: ApprovalResolution): Promise<void> {
    const entry = store.get(resolution.requestId);
    if (!entry) throw new Error(`[approvals] Unknown request: ${resolution.requestId}`);
    entry.resolution = resolution;
    entry.resolve?.(resolution);
  },

  waitForResolution(requestId: string, timeoutMs = 15 * 60 * 1000): Promise<ApprovalResolution> {
    return new Promise((resolve, reject) => {
      const entry = store.get(requestId);
      if (!entry) return reject(new Error(`[approvals] Unknown request: ${requestId}`));
      if (entry.resolution) return resolve(entry.resolution);

      // Attach one-shot resolver so resolveApproval() unblocks us instantly.
      entry.resolve = resolve;

      setTimeout(() => {
        if (!entry.resolution) {
          reject(new Error(`[approvals] Timed out waiting for approval: ${requestId}`));
        }
      }, timeoutMs);
    });
  },

  getRequest(requestId: string): ApprovalRequest | undefined {
    return store.get(requestId)?.request;
  },

  listPending(): ApprovalRequest[] {
    return [...store.values()]
      .filter((e) => !e.resolution)
      .map((e) => e.request);
  },
};

export { approvals };
export default approvals;

// ── Tool Router seam ────────────────────────────────────────────────────────
// The Tool Router depends on this minimal hook. `stubApprovals` is the dev
// default (auto-approves so local runs don't block). Wire `realApprovalHook`
// via `setApprovalHook()` in production to enforce human-in-the-loop.

export interface ApprovalHook {
  requestApproval(req: ApprovalRequest): Promise<ApprovalDecision>;
}

export const stubApprovals: ApprovalHook = {
  async requestApproval(req) {
    console.warn("[approvals] stub: auto-approving", req.toolCall.toolName);
    return "approved";
  },
};

/** Production hook: registers the request and blocks until a human resolves it. */
export const realApprovalHook: ApprovalHook = {
  async requestApproval(req) {
    store.set(req.id, { request: req });
    try {
      const res = await approvals.waitForResolution(req.id);
      return res.decision;
    } catch {
      return "denied"; // timeout or unknown → fail safe
    }
  },
};
