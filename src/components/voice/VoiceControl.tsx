"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────
// TTS Adapter seam
// ─────────────────────────────────────────────────────────────────────────

export interface TTSAdapter {
  /**
   * Speak text. Returns a Promise that resolves when done.
   * Default implementation uses Web SpeechSynthesis.
   * Swap for ElevenLabs or another provider here.
   */
  speak(text: string, voiceId?: string): Promise<void>;
  /** Cancel any ongoing speech. */
  cancel(): void;
}

/** Built-in SpeechSynthesis adapter — zero dependencies. */
const webSpeechAdapter: TTSAdapter = {
  speak(text, _voiceId) {
    return new Promise((resolve) => {
      if (typeof window === "undefined" || !window.speechSynthesis) {
        resolve();
        return;
      }
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.rate = 0.95;
      utt.pitch = 0.9;
      utt.onend = () => resolve();
      utt.onerror = () => resolve();
      window.speechSynthesis.speak(utt);
    });
  },
  cancel() {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Web Speech API types (not in all TS libs)
// ─────────────────────────────────────────────────────────────────────────

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// ─────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────

export type VoiceState = "idle" | "listening" | "processing" | "speaking" | "error" | "unsupported";

export interface VoiceControlProps {
  /** Called with the final recognised transcript. */
  onTranscript: (text: string) => void;
  /** Optional TTS adapter — defaults to Web Speech. Swap for ElevenLabs here. */
  ttsAdapter?: TTSAdapter;
  /** If provided, speak this text immediately. */
  speakText?: string;
  /** TTS voice ID passed to the adapter (for ElevenLabs voice selection). */
  voiceId?: string;
  /** Show the transcript text below the button. */
  showTranscript?: boolean;
  /** Compact variant — no label, icon only. */
  compact?: boolean;
  /** Fired true while listening or speaking, false when idle — drives the orb. */
  onActive?: (active: boolean) => void;
  className?: string;
  "data-testid"?: string;
}

/**
 * VoiceControl — push/hold-to-talk microphone + SpeechSynthesis output.
 *
 * Adapter seam: swap `ttsAdapter` prop for ElevenLabs streaming TTS when ready.
 *   const elevenLabsAdapter: TTSAdapter = { speak: elevenLabsSpeak, cancel: elevenLabsCancel }
 *   <VoiceControl ttsAdapter={elevenLabsAdapter} voiceId="YOUR_VOICE_ID" ... />
 *
 * Web Speech API: no extra deps required. Requires HTTPS or localhost.
 */
export function VoiceControl({
  onTranscript,
  ttsAdapter = webSpeechAdapter,
  speakText,
  voiceId,
  showTranscript = true,
  compact = false,
  onActive,
  className = "",
  "data-testid": testId = "voice-control",
}: VoiceControlProps) {
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoldingRef = useRef(false);
  const latestTextRef = useRef(""); // freshest transcript for the onend closure

  // Broadcast voice activity (listening/speaking) so the orb can react.
  useEffect(() => {
    onActive?.(state === "listening" || state === "speaking");
  }, [state, onActive]);

  // Speak when speakText changes
  useEffect(() => {
    if (!speakText) return;
    setState("speaking");
    ttsAdapter.speak(speakText, voiceId).then(() => {
      setState("idle");
    });
    return () => {
      ttsAdapter.cancel();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speakText]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      ttsAdapter.cancel();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startListening = useCallback(() => {
    const SR = getSpeechRecognition();
    if (!SR) {
      setState("unsupported");
      setErrorMsg("Voice input not supported in this browser.");
      return;
    }
    if (state === "listening") return;

    ttsAdapter.cancel(); // stop any ongoing speech

    try {
      const recognition = new SR();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (e: SpeechRecognitionEvent) => {
        let interim = "";
        let final = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) final += t;
          else interim += t;
        }
        setInterimTranscript(interim);
        latestTextRef.current = final || interim;
        if (final) {
          setTranscript(final);
          setInterimTranscript("");
        }
      };

      recognition.onerror = () => {
        setState("error");
        setErrorMsg("Microphone error. Check browser permissions.");
      };

      recognition.onend = () => {
        setState("processing");
        const finalText = latestTextRef.current.trim();
        if (finalText) {
          onTranscript(finalText);
        }
        latestTextRef.current = "";
        setInterimTranscript("");
        setState("idle");
      };

      recognitionRef.current = recognition;
      recognition.start();
      setState("listening");
      setErrorMsg(null);
    } catch {
      setState("error");
      setErrorMsg("Could not access microphone.");
    }
  }, [state, ttsAdapter, transcript, interimTranscript, onTranscript]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    isHoldingRef.current = false;
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
  }, []);

  // Push-to-talk: hold handlers
  const handlePointerDown = () => {
    isHoldingRef.current = true;
    startListening();
  };

  const handlePointerUp = () => {
    stopListening();
  };

  // Click-to-toggle (tap)
  const handleClick = () => {
    if (state === "listening") {
      stopListening();
    } else if (state === "idle" || state === "error") {
      startListening();
    }
  };

  // Keyboard: Space/Enter to start, release to stop
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === " " || e.key === "Enter") && state !== "listening") {
      e.preventDefault();
      isHoldingRef.current = true;
      startListening();
    }
  };
  const handleKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === " " || e.key === "Enter") {
      stopListening();
    }
  };

  const isListening = state === "listening";
  const isSpeaking = state === "speaking";
  const isProcessing = state === "processing";

  // Accent ring color by state
  const ringColor =
    isListening
      ? "ring-2 ring-[#ff7a17]/60"
      : isSpeaking
        ? "ring-2 ring-[#a0c3ec]/60"
        : "ring-0";

  const ariaLabel =
    state === "idle"
      ? "Hold to speak"
      : isListening
        ? "Listening — release to send"
        : isSpeaking
          ? "Speaking"
          : isProcessing
            ? "Processing"
            : "Voice input";

  return (
    <div
      data-testid={testId}
      data-voice-state={state}
      className={`flex flex-col items-center gap-3 ${className}`}
    >
      {/* Mic button */}
      <button
        data-testid={`${testId}-mic-btn`}
        aria-label={ariaLabel}
        aria-pressed={isListening}
        disabled={state === "unsupported" || state === "processing"}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        className={[
          "relative flex items-center justify-center",
          compact ? "h-11 w-11" : "h-14 w-14",
          "min-h-[44px] min-w-[44px]",
          "rounded-full border border-[#212327] bg-[#191919]",
          "transition-all duration-200",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50",
          "disabled:cursor-not-allowed disabled:opacity-40",
          "select-none",
          ringColor,
          isListening ? "bg-[#ff7a17]/10" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {/* Animated ping when listening */}
        {isListening && (
          <span className="absolute inset-0 animate-ping rounded-full border border-[#ff7a17]/30" />
        )}
        {/* Icon */}
        <MicIcon
          active={isListening}
          speaking={isSpeaking}
          processing={isProcessing}
          size={compact ? 18 : 22}
        />
      </button>

      {/* State label */}
      {!compact && (
        <p
          data-testid={`${testId}-state-label`}
          className="font-mono text-[11px] uppercase tracking-[1.2px] text-[#7d8187]"
        >
          {isListening
            ? "Listening"
            : isSpeaking
              ? "Speaking"
              : isProcessing
                ? "Processing"
                : state === "error"
                  ? "Error"
                  : state === "unsupported"
                    ? "Not supported"
                    : "Hold to talk"}
        </p>
      )}

      {/* Live transcript */}
      {showTranscript && (transcript || interimTranscript) && (
        <div
          data-testid={`${testId}-transcript`}
          className="max-w-xs rounded-[8px] border border-[#212327] bg-[#191919] px-3 py-2"
        >
          <p className="text-[14px] leading-[20px] text-[#dadbdf]">
            {transcript || interimTranscript}
            {interimTranscript && !transcript && (
              <span className="text-[#7d8187]"> …</span>
            )}
          </p>
        </div>
      )}

      {/* Error */}
      {errorMsg && (
        <p
          data-testid={`${testId}-error`}
          role="alert"
          className="text-[12px] leading-[16px] text-[#ff7a17]"
        >
          {errorMsg}
        </p>
      )}
    </div>
  );
}

// ─── Mic SVG icon ────────────────────────────────────────────────────────

function MicIcon({
  active,
  speaking,
  processing,
  size = 22,
}: {
  active: boolean;
  speaking: boolean;
  processing: boolean;
  size?: number;
}) {
  const color = active
    ? "#ff7a17"
    : speaking
      ? "#a0c3ec"
      : processing
        ? "#c4b5fd"
        : "#7d8187";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={processing ? "animate-pulse" : ""}
    >
      {/* Microphone body */}
      <rect x="9" y="2" width="6" height="11" rx="3" fill={color} />
      {/* Stand */}
      <path
        d="M5 10a7 7 0 0 0 14 0"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      <line
        x1="12"
        y1="17"
        x2="12"
        y2="21"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="9"
        y1="21"
        x2="15"
        y2="21"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
