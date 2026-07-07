"use client";

import { useRef, useState } from "react";
import { VoiceControl } from "@/components/voice/VoiceControl";

export interface ChatMessage {
  id: string;
  role: "user" | "brain";
  text: string;
}

interface BrainChatProps {
  personaName: string;
  onSend?: (text: string) => void;
  onVoiceActive?: (active: boolean) => void;
  className?: string;
  "data-testid"?: string;
}

/** The centerpiece: talk or type to get anything done. */
export function BrainChat({
  personaName,
  onSend,
  onVoiceActive,
  className = "",
  "data-testid": testId = "brain-chat",
}: BrainChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollDown = () => requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 1e9, behavior: "smooth" }));

  const send = async (text: string) => {
    const t = text.trim();
    if (!t) return;
    const userMsg: ChatMessage = { id: `u_${Date.now()}`, role: "user", text: t };
    const brainId = `b_${Date.now()}`;
    setMessages((m) => [...m, userMsg, { id: brainId, role: "brain", text: "" }]);
    setInput("");
    onSend?.(t);
    scrollDown();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: t }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) => m.map((msg) => (msg.id === brainId ? { ...msg, text: acc } : msg)));
        scrollDown();
      }
      if (!acc.trim()) {
        setMessages((m) => m.map((msg) => (msg.id === brainId ? { ...msg, text: "(No response. Set AI_GATEWAY_API_KEY in .env.local to bring me online.)" } : msg)));
      }
    } catch {
      setMessages((m) => m.map((msg) => (msg.id === brainId ? { ...msg, text: "I couldn't reach the model. Add AI_GATEWAY_API_KEY to .env.local and restart to bring me online." } : msg)));
    }
  };

  return (
    <div
      data-testid={testId}
      className={`flex flex-col rounded-2xl border border-[var(--accent-deep)]/40 bg-[var(--panel)]/80 backdrop-blur ${className}`}
      style={{ boxShadow: "0 0 40px rgba(255,106,0,0.06), inset 0 0 1px rgba(255,106,0,0.3)" }}
    >
      {/* header */}
      <div className="flex items-center justify-between border-b border-[var(--accent-deep)]/30 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
          <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--accent-soft)]">
            {personaName} · direct line
          </span>
        </div>
        <span className="font-mono text-[10px] text-zinc-600">CMD+K</span>
      </div>

      {/* messages — collapses to nothing when idle */}
      {messages.length > 0 && (
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" style={{ maxHeight: 320 }}>
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[80%] rounded-2xl rounded-br-sm bg-[var(--accent)]/15 px-3.5 py-2 text-sm text-zinc-100 ring-1 ring-[var(--accent)]/30"
                  : "max-w-[85%] rounded-2xl rounded-bl-sm bg-white/[0.04] px-3.5 py-2 text-sm text-zinc-300 ring-1 ring-white/5"
              }
            >
              {m.role === "brain" && (
                <span className="mr-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--accent-soft)]">›</span>
              )}
              {m.text}
            </div>
          </div>
        ))}
      </div>
      )}

      {/* input row */}
      <div className="flex items-center gap-2 border-t border-[var(--accent-deep)]/30 p-2.5">
        <input
          data-testid="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder="Tell me what to do…"
          className="min-h-[44px] flex-1 rounded-xl border border-white/10 bg-black/40 px-3.5 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-[var(--accent)]/60"
        />
        <VoiceControl
          compact
          onTranscript={(t: string) => send(t)}
          onActive={onVoiceActive}
          data-testid="chat-voice"
        />
        <button
          data-testid="chat-send"
          onClick={() => send(input)}
          className="grid min-h-[44px] min-w-[44px] place-items-center rounded-xl bg-[var(--accent)] text-black transition-colors hover:bg-[var(--accent-bright)]"
          aria-label="Send"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
        </button>
      </div>
    </div>
  );
}
