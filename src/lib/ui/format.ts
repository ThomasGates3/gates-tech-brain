import type { AgentEvent, ToolCall, ToolCallStatus, RiskLevel } from "@/lib/types";

/** Format ISO timestamp to HH:MM:SS */
export function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return "--:--:--";
  }
}

/** Format latency in ms to human string */
export function fmtLatency(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/** Format cost in USD */
export function fmtCost(usd?: number): string {
  if (usd == null) return "—";
  if (usd < 0.01) return `$${(usd * 1000).toFixed(2)}m`;
  return `$${usd.toFixed(4)}`;
}

/** Return a one-line label for an AgentEvent */
export function eventLabel(event: AgentEvent): string {
  switch (event.type) {
    case "thinking":   return `[${event.agentId.toUpperCase()}] ${event.text.slice(0, 80)}`;
    case "delegating": return `Delegating → ${event.to}: ${event.task.slice(0, 60)}`;
    case "tool_call":  return `Tool call: ${event.call.connectorId}/${event.call.toolName}`;
    case "tool_result":return `Tool result: ${event.result.status} (${fmtLatency(event.result.latencyMs)})`;
    case "approval_request": return `Approval required: ${event.request.toolCall.toolName}`;
    case "message":    return `${event.role === "assistant" ? "BRAIN" : "YOU"}: ${event.text.slice(0, 80)}`;
    case "briefing":   return `Briefing: ${event.text.slice(0, 80)}`;
    case "error":      return `ERROR: ${event.message}`;
    case "done":       return "Task complete.";
    default:           return "Event";
  }
}

/** CSS color for a ToolCallStatus */
export function statusColor(status: ToolCallStatus): string {
  const map: Record<ToolCallStatus, string> = {
    pending:           "var(--mute)",
    awaiting_approval: "var(--accent-sunset)",
    running:           "var(--accent-breeze)",
    success:           "#22c55e",
    error:             "#ef4444",
    denied:            "var(--mute)",
  };
  return map[status] ?? "var(--mute)";
}

/** CSS color for a RiskLevel */
export function riskColor(risk: RiskLevel): string {
  const map: Record<RiskLevel, string> = {
    read:        "#22c55e",
    write:       "var(--accent-sunset)",
    destructive: "#ef4444",
  };
  return map[risk];
}

/** Agent emoji/icon for display */
export function agentIcon(id: string): string {
  const map: Record<string, string> = {
    conductor: "⬡",
    research:  "⌖",
    data:      "◈",
    devops:    "⚙",
    comms:     "◉",
  };
  return map[id] ?? "◦";
}
