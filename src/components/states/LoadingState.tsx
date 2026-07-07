"use client";

import React from "react";

export interface LoadingStateProps {
  label?: string;
  subLabel?: string;
  /** Show a pulsing orb instead of a bar */
  variant?: "bar" | "orb" | "dots";
  className?: string;
  "data-testid"?: string;
}

/**
 * LoadingState — xAI canvas, animated indicators.
 * Orb variant mirrors the HUD presence pulse.
 */
export function LoadingState({
  label = "Loading",
  subLabel,
  variant = "orb",
  className = "",
  "data-testid": testId = "loading-state",
}: LoadingStateProps) {
  return (
    <div
      data-testid={testId}
      className={`flex flex-col items-center justify-center gap-4 py-12 ${className}`}
      role="status"
      aria-label={label}
    >
      {variant === "orb" && (
        <div data-testid={`${testId}-orb`} className="relative flex items-center justify-center">
          {/* Outer ring */}
          <span className="absolute h-16 w-16 animate-ping rounded-full border border-white/10" />
          {/* Core orb */}
          <span className="h-8 w-8 animate-pulse rounded-full bg-white/20" />
        </div>
      )}

      {variant === "bar" && (
        <div data-testid={`${testId}-bar`} className="h-[2px] w-48 overflow-hidden rounded-full bg-[#212327]">
          <div className="h-full w-1/2 animate-[slide_1.2s_ease-in-out_infinite] rounded-full bg-white/40" />
        </div>
      )}

      {variant === "dots" && (
        <div data-testid={`${testId}-dots`} className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/40"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col items-center gap-1">
        <p data-testid={`${testId}-label`} className="text-[14px] leading-[20px] text-[#dadbdf]">
          {label}
        </p>
        {subLabel && (
          <p data-testid={`${testId}-sublabel`} className="font-mono text-[12px] uppercase tracking-[1.2px] text-[#7d8187]">
            {subLabel}
          </p>
        )}
      </div>
    </div>
  );
}
