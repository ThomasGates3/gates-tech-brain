"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { AgentEvent } from "@/lib/types";

export type StreamStatus = "idle" | "connecting" | "streaming" | "done" | "error";

export interface UseAgentStreamOptions {
  /** SSE endpoint — e.g. /api/chat */
  url: string;
  /** Only connect when true */
  enabled?: boolean;
  onEvent?: (event: AgentEvent) => void;
}

export interface UseAgentStreamReturn {
  events: AgentEvent[];
  status: StreamStatus;
  error: string | null;
  /** Send a message to kick off a new stream */
  send: (prompt: string) => void;
  clear: () => void;
}

/**
 * useAgentStream — SSE hook for the AI Brain agent feed.
 *
 * API agent wiring: POST to `url` with `{ prompt }` JSON body.
 * The server should respond with `text/event-stream` where each event is
 * a JSON-serialised `AgentEvent` sent as `data: {...}\n\n`.
 *
 * Example server shape:
 *   res.write(`data: ${JSON.stringify(event)}\n\n`);
 */
export function useAgentStream({
  url,
  enabled = true,
  onEvent,
}: UseAgentStreamOptions): UseAgentStreamReturn {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const clear = useCallback(() => {
    setEvents([]);
    setStatus("idle");
    setError(null);
  }, []);

  const send = useCallback(
    async (prompt: string) => {
      if (!enabled) return;

      // Cancel any existing stream
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setEvents([]);
      setError(null);
      setStatus("connecting");

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`);
        }

        setStatus("streaming");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() ?? "";

          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data:")) continue;
            try {
              const event = JSON.parse(line.slice(5).trim()) as AgentEvent;
              setEvents((prev) => [...prev, event]);
              onEvent?.(event);
              if (event.type === "done" || event.type === "error") {
                setStatus(event.type === "done" ? "done" : "error");
              }
            } catch {
              // skip malformed events
            }
          }
        }

        setStatus((s) => (s === "streaming" ? "done" : s));
      } catch (err: unknown) {
        if ((err as { name?: string }).name === "AbortError") return;
        const msg = err instanceof Error ? err.message : "Stream error";
        setError(msg);
        setStatus("error");
      }
    },
    [url, enabled, onEvent],
  );

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { events, status, error, send, clear };
}
