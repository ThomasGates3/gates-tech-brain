"use client";

import React from "react";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    testId?: string;
  };
  /** Mono eyebrow label above the title */
  eyebrow?: string;
  className?: string;
  "data-testid"?: string;
}

/**
 * EmptyState — xAI design system, canvas-card surface, hairline border.
 * Used wherever no data exists yet (connector manager, knowledge panel, etc.)
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  eyebrow,
  className = "",
  "data-testid": testId = "empty-state",
}: EmptyStateProps) {
  return (
    <div
      data-testid={testId}
      className={`flex flex-col items-center justify-center gap-6 rounded-[8px] border border-[#212327] bg-[#191919] px-6 py-12 text-center ${className}`}
    >
      {eyebrow && (
        <p
          data-testid={`${testId}-eyebrow`}
          className="font-mono text-[12px] uppercase tracking-[1.2px] text-[#7d8187]"
        >
          {eyebrow}
        </p>
      )}

      {icon && (
        <div data-testid={`${testId}-icon`} className="text-[#7d8187]">
          {icon}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3
          data-testid={`${testId}-title`}
          className="text-[20px] leading-[28px] text-[#ffffff]"
          style={{ letterSpacing: 0 }}
        >
          {title}
        </h3>
        {description && (
          <p
            data-testid={`${testId}-description`}
            className="max-w-sm text-[14px] leading-[20px] text-[#7d8187]"
          >
            {description}
          </p>
        )}
      </div>

      {action && (
        <button
          data-testid={action.testId ?? `${testId}-action`}
          onClick={action.onClick}
          className="min-h-[44px] rounded-full border border-[#212327] bg-[#0a0a0a] px-4 py-2 text-[14px] leading-[20px] text-[#ffffff] transition-colors hover:border-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
