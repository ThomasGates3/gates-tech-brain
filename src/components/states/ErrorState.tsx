"use client";

import React from "react";

export interface ErrorStateProps {
  title?: string;
  message: string;
  code?: string;
  retry?: () => void;
  dismiss?: () => void;
  className?: string;
  "data-testid"?: string;
}

/**
 * ErrorState — sunset-orange accent for error surfaces.
 * Keyboard accessible: Tab to retry / dismiss, Enter / Space to activate.
 */
export function ErrorState({
  title = "Something went wrong",
  message,
  code,
  retry,
  dismiss,
  className = "",
  "data-testid": testId = "error-state",
}: ErrorStateProps) {
  return (
    <div
      data-testid={testId}
      role="alert"
      className={`flex flex-col gap-4 rounded-[8px] border border-[#ff7a17]/30 bg-[#191919] p-6 ${className}`}
    >
      {/* Eyebrow */}
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[12px] uppercase tracking-[1.2px] text-[#ff7a17]">
          {code ? `ERROR · ${code}` : "ERROR"}
        </p>
        {dismiss && (
          <button
            data-testid={`${testId}-dismiss`}
            onClick={dismiss}
            aria-label="Dismiss error"
            className="min-h-[44px] min-w-[44px] rounded-full text-[#7d8187] transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50"
          >
            ✕
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-col gap-1.5">
        <h4
          data-testid={`${testId}-title`}
          className="text-[16px] leading-[24px] text-white"
        >
          {title}
        </h4>
        <p
          data-testid={`${testId}-message`}
          className="text-[14px] leading-[20px] text-[#7d8187]"
        >
          {message}
        </p>
      </div>

      {/* Actions */}
      {retry && (
        <button
          data-testid={`${testId}-retry`}
          onClick={retry}
          className="min-h-[44px] self-start rounded-full border border-[#212327] bg-[#0a0a0a] px-4 py-2 text-[14px] leading-[20px] text-white transition-colors hover:border-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50"
        >
          Try again
        </button>
      )}
    </div>
  );
}
