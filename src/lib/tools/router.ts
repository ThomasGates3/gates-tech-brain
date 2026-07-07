/**
 * Tool Router — maps a ToolCall → connector HTTP call → ToolResult.
 * Enforces risk-level approval gates (write/destructive pause for human approval).
 */
import type { ToolCall, ToolResult, ToolSpec, Connector } from "@/lib/types";
import { registry } from "@/lib/connectors/registry";
import { vault } from "@/lib/vault";
import { stubApprovals } from "@/lib/approvals";
import type { ApprovalHook } from "@/lib/approvals";

let approvalHook: ApprovalHook = stubApprovals;

/** Security agent calls this to wire in the real approval implementation. */
export function setApprovalHook(hook: ApprovalHook) {
  approvalHook = hook;
}

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

export async function executeToolCall(call: ToolCall): Promise<ToolResult> {
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

  // Risk gate: write + destructive require approval
  if (spec.risk === "write" || spec.risk === "destructive") {
    const decision = await approvalHook.requestApproval({
      id: `apr_${call.id}`,
      toolCall: call,
      reason: `Tool '${call.toolName}' has risk level '${spec.risk}' and requires approval.`,
      requestedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });

    if (decision === "denied") {
      return {
        toolCallId: call.id,
        status: "error",
        error: "Action denied by approval gate",
        latencyMs: Date.now() - start,
      };
    }
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
