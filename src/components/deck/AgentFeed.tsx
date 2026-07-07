"use client";

import { useEffect, useRef } from "react";
import type { AgentEvent } from "@/lib/types";
import { fmtTime, eventLabel, agentIcon } from "@/lib/ui/format";

interface AgentFeedProps {
  events: AgentEvent[];
  className?: string;
  "data-testid"?: string;
}

function EventRow({ event }: { event: AgentEvent }) {
  const time = fmtTime(event.at);
  const icon = event.type === "thinking" || event.type === "delegating" || event.type === "tool_call" || event.type === "tool_result"
    ? agentIcon(
        event.type === "thinking" || event.type === "delegating"
          ? (event as { agentId?: string; to?: string }).agentId ?? (event as { to?: string }).to ?? "conductor"
          : "conductor"
      )
    : "◦";

  const accentColor = (() => {
    switch (event.type) {
      case "thinking":        return "var(--accent-sunset)";
      case "delegating":      return "var(--accent-dusk)";
      case "tool_call":       return "var(--accent-breeze)";
      case "tool_result":     return event.result.status === "success" ? "#22c55e" : "#ef4444";
      case "approval_request":return "var(--accent-sunset)";
      case "message":         return event.role === "assistant" ? "var(--accent-twilight)" : "var(--mute)";
      case "briefing":        return "#22c55e";
      case "error":           return "#ef4444";
      case "done":            return "var(--mute)";
      default:                return "var(--mute)";
    }
  })();

  return (
    <div
      className="flex items-start gap-3 px-4 py-2.5 border-b animate-fade-in-up"
      style={{ borderColor: "var(--hairline)" }}
      data-testid="agent-feed-event"
      data-event-type={event.type}
    >
      {/* Icon + timeline */}
      <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-0.5">
        <span style={{ color: accentColor, fontSize: 14, fontFamily: "monospace" }}>{icon}</span>
        <div className="w-px flex-1 min-h-2" style={{ background: "var(--hairline)" }} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className="eyebrow"
            style={{ fontSize: 9, color: accentColor }}
          >
            {event.type.replace("_", " ").toUpperCase()}
          </span>
          <span className="font-mono text-[10px]" style={{ color: "var(--mute)" }}>{time}</span>
        </div>
        <p className="text-sm leading-snug" style={{ color: "var(--body)", wordBreak: "break-word" }}>
          {eventLabel(event)}
        </p>
        {/* Briefing highlights */}
        {event.type === "briefing" && event.highlights.length > 0 && (
          <ul className="mt-1.5 flex flex-col gap-1">
            {event.highlights.map((h, i) => (
              <li key={i} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--body)" }}>
                <span style={{ color: "#22c55e" }}>›</span> {h}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Live-streaming feed of AgentEvent activity */
export default function AgentFeed({
  events,
  className = "",
  "data-testid": testId = "agent-feed",
}: AgentFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

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
        <span className="eyebrow">AGENT FEED</span>
        <span className="eyebrow" style={{ fontSize: 9, color: "var(--mute)" }}>
          {events.length} EVENTS
        </span>
      </div>

      {/* Events list */}
      <div className="flex-1 overflow-y-auto">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
            <div className="eyebrow" style={{ color: "var(--mute)" }}>AWAITING SIGNAL</div>
            <p className="text-sm" style={{ color: "var(--mute)" }}>
              Brain activity will stream here in real time.
            </p>
          </div>
        ) : (
          <>
            {events.map((event, i) => (
              <EventRow key={`${event.type}-${event.at}-${i}`} event={event} />
            ))}
          </>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
