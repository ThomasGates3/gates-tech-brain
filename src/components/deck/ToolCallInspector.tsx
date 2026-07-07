"use client";

import { useState } from "react";
import type { ToolCall, ToolResult } from "@/lib/types";
import { fmtTime, fmtLatency, fmtCost, statusColor, riskColor } from "@/lib/ui/format";

interface ToolCallRow {
  call: ToolCall;
  result?: ToolResult;
}

interface ToolCallInspectorProps {
  rows: ToolCallRow[];
  className?: string;
  "data-testid"?: string;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className="eyebrow px-2 py-0.5 rounded"
      style={{
        fontSize: 9,
        color: statusColor(status as ToolCall["status"]),
        border: `1px solid ${statusColor(status as ToolCall["status"])}44`,
        background: `${statusColor(status as ToolCall["status"])}11`,
      }}
    >
      {status.toUpperCase()}
    </span>
  );
}

function RiskBadge({ risk }: { risk: ToolCall["risk"] }) {
  return (
    <span
      className="eyebrow px-2 py-0.5 rounded"
      style={{
        fontSize: 9,
        color: riskColor(risk),
        border: `1px solid ${riskColor(risk)}44`,
        background: `${riskColor(risk)}11`,
      }}
    >
      {risk.toUpperCase()}
    </span>
  );
}

function InspectorRow({ row }: { row: ToolCallRow }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="border-b"
      style={{ borderColor: "var(--hairline)" }}
      data-testid="tool-call-row"
      data-tool-status={row.call.status}
    >
      {/* Summary row */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded((v) => !v)}
        data-testid="tool-call-expand"
        style={{ minHeight: 44 }}
      >
        <span className="font-mono text-xs flex-shrink-0" style={{ color: "var(--mute)", width: 60 }}>
          {fmtTime(row.call.createdAt)}
        </span>

        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          <span className="text-sm font-mono" style={{ color: "var(--ink)" }}>
            {row.call.connectorId}
          </span>
          <span style={{ color: "var(--mute)" }}>/</span>
          <span className="text-sm" style={{ color: "var(--accent-breeze)" }}>
            {row.call.toolName}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <RiskBadge risk={row.call.risk} />
          <StatusBadge status={row.call.status} />
          {row.result && (
            <span className="font-mono text-xs" style={{ color: "var(--mute)" }}>
              {fmtLatency(row.result.latencyMs)}
            </span>
          )}
          {row.result?.costUsd != null && (
            <span className="font-mono text-xs" style={{ color: "var(--mute)" }}>
              {fmtCost(row.result.costUsd)}
            </span>
          )}
          <span className="text-xs" style={{ color: "var(--mute)", transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div
          className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-3 animate-fade-in-up"
          style={{ borderTop: "1px solid var(--hairline)" }}
          data-testid="tool-call-detail"
        >
          {/* Request */}
          <div>
            <div className="eyebrow mb-2" style={{ fontSize: 9, color: "var(--mute)" }}>REQUEST ARGS</div>
            <pre
              className="text-xs rounded p-3 overflow-x-auto"
              style={{
                background: "var(--canvas-mid)",
                color: "var(--body)",
                fontFamily: "var(--font-mono), monospace",
                maxHeight: 160,
              }}
            >
              {JSON.stringify(row.call.args, null, 2)}
            </pre>
          </div>

          {/* Response */}
          <div>
            <div className="eyebrow mb-2" style={{ fontSize: 9, color: "var(--mute)" }}>
              RESPONSE {row.result ? `— ${fmtLatency(row.result.latencyMs)}` : ""}
            </div>
            <pre
              className="text-xs rounded p-3 overflow-x-auto"
              style={{
                background: "var(--canvas-mid)",
                color: row.result?.status === "error" ? "#ef4444" : "var(--body)",
                fontFamily: "var(--font-mono), monospace",
                maxHeight: 160,
              }}
            >
              {row.result
                ? row.result.error
                  ? row.result.error
                  : JSON.stringify(row.result.data, null, 2)
                : "Awaiting response..."}
            </pre>
          </div>

          {/* Metadata strip */}
          <div className="md:col-span-2 flex gap-4 flex-wrap" style={{ borderTop: "1px solid var(--hairline)", paddingTop: 12 }}>
            <div>
              <div className="eyebrow" style={{ fontSize: 9, color: "var(--mute)" }}>AGENT</div>
              <span className="text-xs font-mono" style={{ color: "var(--ink)" }}>{row.call.agentId}</span>
            </div>
            <div>
              <div className="eyebrow" style={{ fontSize: 9, color: "var(--mute)" }}>CALL ID</div>
              <span className="text-xs font-mono" style={{ color: "var(--mute)" }}>{row.call.id.slice(0, 12)}…</span>
            </div>
            {row.result?.costUsd != null && (
              <div>
                <div className="eyebrow" style={{ fontSize: 9, color: "var(--mute)" }}>COST</div>
                <span className="text-xs font-mono" style={{ color: "var(--ink)" }}>{fmtCost(row.result.costUsd)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Tool-call inspector: request / response / latency / cost per call */
export default function ToolCallInspector({
  rows,
  className = "",
  "data-testid": testId = "tool-call-inspector",
}: ToolCallInspectorProps) {
  return (
    <div
      data-testid={testId}
      className={`flex flex-col h-full overflow-hidden hud-panel ${className}`}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
        style={{ borderColor: "var(--hairline)" }}
      >
        <span className="eyebrow">TOOL INSPECTOR</span>
        <span className="eyebrow" style={{ fontSize: 9, color: "var(--mute)" }}>
          {rows.length} CALLS
        </span>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 p-8 text-center">
            <div className="eyebrow" style={{ color: "var(--mute)" }}>NO TOOL CALLS</div>
            <p className="text-sm" style={{ color: "var(--mute)" }}>
              Tool executions will appear here with full request/response details.
            </p>
          </div>
        ) : (
          rows.map((row) => <InspectorRow key={row.call.id} row={row} />)
        )}
      </div>
    </div>
  );
}
