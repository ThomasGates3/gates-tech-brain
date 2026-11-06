/**
 * Tool Router — maps a ToolCall → connector HTTP call → ToolResult.
 * write/destructive calls don't run here: they're saved for Thomas (lib/approvals)
 * and run from POST /api/approvals/[id] once he approves.
 */
import type { ToolCall, ToolResult, ToolSpec, Connector } from "@/lib/types";
import { registry } from "@/lib/connectors/registry";
import { vault } from "@/lib/vault";
import { APPROVAL_TTL_HOURS, requestApproval } from "@/lib/approvals";
import { notifyOnce } from "@/lib/notify";
import audit from "@/lib/audit";

function buildUrl(connector: Connector, spec: ToolSpec, args: Record<string, unknown>): string {
  let path = spec.path;
  // Substitute {param} placeholders from args
  for (const [key, param] of Object.entries(spec.params ?? {})) {
    if (param.in === "path") {
      path = path.replace(`{${key}}`, encodeURIComponent(String(args[key] ?? "")));
    }
  }
  const url = new URL(connector.baseUrl + path);
  for (const [key, param] of Object.entries(spec.params ?? {})) {
    if (param.in === "query" && args[key] != null) {
      url.searchParams.set(key, String(args[key]));
    }
  }
  return url.toString();
}

function buildBody(spec: ToolSpec, args: Record<string, unknown>): Record<string, unknown> | undefined {
  const body: Record<string, unknown> = {};
  for (const [key, param] of Object.entries(spec.params ?? {})) {
    if (param.in === "body" && args[key] != null) body[key] = args[key];
  }
  return Object.keys(body).length ? body : undefined;
}

async function buildHeaders(connector: Connector): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!connector.credential) return headers;

  const secret = await vault.get(connector.credential.vaultKey);
  if (!secret) {
    console.warn(`[tool-router] Vault key ${connector.credential.vaultKey} not found`);
    return headers;
  }

  switch (connector.auth) {
    case "api_key":
      headers["apikey"] = secret;
      headers["Authorization"] = `Bearer ${secret}`;
      break;
    case "bearer":
      headers["Authorization"] = `Bearer ${secret}`;
      break;
    // oauth + aws_sig require more complex flows; Security agent will extend this.
    default:
      break;
  }
  return headers;
}

function extractResult(data: unknown, resultPath?: string): unknown {
  if (!resultPath || typeof data !== "object" || !data) return data;
  return (data as Record<string, unknown>)[resultPath];
}

/** What agents call. A failure to save the approval returns an error; the action never runs unapproved. */
export async function executeToolCall(call: ToolCall): Promise<ToolResult> {
  const spec = registry.get(call.connectorId)?.tools.find((t) => t.name === call.toolName);
  if (spec?.risk !== "write" && spec?.risk !== "destructive") return runToolCall(call);

  try {
    const { id, created } = await requestApproval(call, `${call.toolName} has risk level ${spec.risk}.`);
    if (created) {
      await audit.record({ action: "approval", actor: call.agentId, target: `${call.connectorId} ${call.toolName}`, detail: { approvalId: id, decision: "requested", args: call.args } });
      await notifyOnce("approval_waiting", id, "An action needs your approval", `${call.agentId} wants to run ${call.connectorId} ${call.toolName}. Approve or deny it on the Operations page.`);
    }
    return {
      toolCallId: call.id,
      status: "awaiting_approval",
      data: { approvalId: id, message: `Not done yet: this is waiting on Thomas to approve it on the Operations page (expires in ${APPROVAL_TTL_HOURS} hours). Tell him that, and don't try it again.` },
      latencyMs: 0,
    };
  } catch (e) {
    console.error("[tool-router] approval failed", e);
    return { toolCallId: call.id, status: "error", error: "Couldn't save the approval request, so the action did not run.", latencyMs: 0 };
  }
}

/** Runs the HTTP call with no approval check. Only for read tools and calls Thomas has approved. */
export async function runToolCall(call: ToolCall): Promise<ToolResult> {
  const start = Date.now();

  const connector = registry.get(call.connectorId);
  if (!connector) {
    return { toolCallId: call.id, status: "error", error: `Connector '${call.connectorId}' not found`, latencyMs: 0 };
  }

  const spec = connector.tools.find((t) => t.name === call.toolName);
  if (!spec) {
    return {
      toolCallId: call.id,
      status: "error",
      error: `Tool '${call.toolName}' not found in connector '${call.connectorId}'`,
      latencyMs: 0,
    };
  }

  try {
    const [url, headers, body] = await Promise.all([
      Promise.resolve(buildUrl(connector, spec, call.args)),
      buildHeaders(connector),
      Promise.resolve(buildBody(spec, call.args)),
    ]);

    const res = await fetch(url, {
      method: spec.method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const raw = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        toolCallId: call.id,
        status: "error",
        error: `HTTP ${res.status}: ${JSON.stringify(raw)}`,
        latencyMs: Date.now() - start,
      };
    }

    return {
      toolCallId: call.id,
      status: "success",
      data: extractResult(raw, spec.resultPath),
      latencyMs: Date.now() - start,
    };
  } catch (e) {
    return {
      toolCallId: call.id,
      status: "error",
      error: e instanceof Error ? e.message : "Unknown error",
      latencyMs: Date.now() - start,
    };
  }
}
