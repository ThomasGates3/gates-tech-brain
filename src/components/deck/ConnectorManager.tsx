"use client";

import { useState } from "react";
import type { Connector, ConnectorStatus } from "@/lib/types";

interface ConnectorManagerProps {
  connectors: Connector[];
  statuses?: ConnectorStatus[];
  onTest?: (id: string) => void;
  onToggle?: (id: string, enabled: boolean) => void;
  onAdd?: () => void;
  className?: string;
  "data-testid"?: string;
}

const AUTH_LABEL: Record<string, string> = {
  none:     "NONE",
  api_key:  "API KEY",
  bearer:   "BEARER",
  oauth:    "OAUTH",
  aws_sig:  "AWS SIG",
};

function ConnectorRow({
  connector,
  status,
  onTest,
  onToggle,
}: {
  connector: Connector;
  status?: ConnectorStatus;
  onTest?: (id: string) => void;
  onToggle?: (id: string, enabled: boolean) => void;
}) {
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    await new Promise((r) => setTimeout(r, 600));
    onTest?.(connector.id);
    setTesting(false);
  };

  const reachable = status?.reachable ?? null;
  const dotClass = connector.enabled
    ? reachable === true
      ? "status-dot-active"
      : reachable === false
      ? "status-dot-error"
      : "status-dot-pending"
    : "status-dot-idle";

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 border-b"
      style={{ borderColor: "var(--hairline)" }}
      data-testid="connector-row"
      data-connector-id={connector.id}
      data-connector-enabled={connector.enabled}
    >
      {/* Status dot */}
      <div className={`status-dot ${dotClass} flex-shrink-0`} />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm" style={{ color: "var(--ink)" }}>{connector.label}</span>
          <span
            className="eyebrow px-1.5 py-0.5 rounded"
            style={{
              fontSize: 9,
              color: "var(--mute)",
              border: "1px solid var(--hairline)",
            }}
          >
            {AUTH_LABEL[connector.auth]}
          </span>
          <span className="eyebrow" style={{ fontSize: 9, color: "var(--mute)" }}>
            {connector.tools.length} TOOLS
          </span>
        </div>
        <div className="text-xs mt-0.5 truncate" style={{ color: "var(--mute)" }}>
          {connector.baseUrl}
        </div>
        {status?.message && (
          <div className="text-xs mt-0.5" style={{ color: reachable ? "#22c55e" : "#ef4444" }}>
            {status.message}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          className="btn-hud text-xs"
          style={{ minHeight: 32, padding: "4px 12px", fontSize: 12 }}
          onClick={handleTest}
          disabled={testing}
          data-testid="connector-test"
          data-connector-id={connector.id}
        >
          {testing ? "TESTING…" : "TEST"}
        </button>
        <button
          className={`btn-hud text-xs ${connector.enabled ? "btn-hud-danger" : ""}`}
          style={{ minHeight: 32, padding: "4px 12px", fontSize: 12 }}
          onClick={() => onToggle?.(connector.id, !connector.enabled)}
          data-testid="connector-toggle"
          data-connector-id={connector.id}
          data-connector-enabled={connector.enabled}
        >
          {connector.enabled ? "DISABLE" : "ENABLE"}
        </button>
      </div>
    </div>
  );
}

/** Connector manager — list, test, enable/disable connectors from the deck */
export default function ConnectorManager({
  connectors,
  statuses = [],
  onTest,
  onToggle,
  onAdd,
  className = "",
  "data-testid": testId = "connector-manager",
}: ConnectorManagerProps) {
  const statusMap = new Map(statuses.map((s) => [s.connectorId, s]));

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
        <span className="eyebrow">CONNECTORS</span>
        <button
          className="btn-hud text-xs"
          style={{ minHeight: 32, padding: "4px 14px", fontSize: 12 }}
          onClick={onAdd}
          data-testid="connector-add"
        >
          + ADD
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {connectors.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 p-8 text-center">
            <div className="eyebrow" style={{ color: "var(--mute)" }}>NO CONNECTORS</div>
            <p className="text-sm" style={{ color: "var(--mute)" }}>
              Add a connector to give the brain access to your systems.
            </p>
            <button
              className="btn-hud mt-2"
              onClick={onAdd}
              data-testid="connector-add-empty"
            >
              + Add first connector
            </button>
          </div>
        ) : (
          connectors.map((c) => (
            <ConnectorRow
              key={c.id}
              connector={c}
              status={statusMap.get(c.id)}
              onTest={onTest}
              onToggle={onToggle}
            />
          ))
        )}
      </div>

      {/* Footer stats */}
      {connectors.length > 0 && (
        <div
          className="px-4 py-2 border-t flex gap-4"
          style={{ borderColor: "var(--hairline)" }}
        >
          <span className="eyebrow" style={{ fontSize: 9, color: "var(--mute)" }}>
            {connectors.filter((c) => c.enabled).length}/{connectors.length} ENABLED
          </span>
          <span className="eyebrow" style={{ fontSize: 9, color: "var(--mute)" }}>
            {connectors.reduce((n, c) => n + c.tools.length, 0)} TOTAL TOOLS
          </span>
        </div>
      )}
    </div>
  );
}
