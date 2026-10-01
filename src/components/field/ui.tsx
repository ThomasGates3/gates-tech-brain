"use client";

import type { Priority, Stage } from "@/lib/field/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

const STAGE_LABEL: Record<Stage, string> = {
  new: "New",
  drafted: "Drafted",
  nick: "Nick",
  approved: "Approved",
  sending: "Sending",
  sent: "Sent",
  hold: "Hold",
  kill: "Kill",
};

const STAGE_STYLE: Record<Stage, string> = {
  new: "border-white/15 text-zinc-300",
  drafted: "border-sky-400/40 text-sky-300",
  nick: "border-violet-400/40 text-violet-300",
  approved: "border-[#ff8c1a]/60 text-[#ffb066]",
  sending: "border-[#ff8c1a]/60 text-[#ffb066] animate-pulse",
  sent: "border-emerald-400/40 text-emerald-300",
  hold: "border-amber-300/30 text-amber-200/80",
  kill: "border-red-500/40 text-red-400",
};

export function StageBadge({ stage }: { stage: Stage }) {
  return (
    <span className={cx("inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]", STAGE_STYLE[stage])} data-testid="stage-badge">
      {STAGE_LABEL[stage]}
    </span>
  );
}

const PRI_STYLE: Record<Priority, string> = {
  High: "bg-[#ff6a00] text-black",
  Med: "bg-[#ff6a00]/25 text-[#ffb066]",
  Soft: "bg-white/5 text-zinc-500",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={cx("inline-flex rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider", PRI_STYLE[priority])}>{priority}</span>;
}

export function Button({
  variant = "ghost",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "quiet" }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" && "bg-[#ff6a00] text-black hover:bg-[#ff8c1a]",
        variant === "ghost" && "border border-white/15 text-zinc-100 hover:border-white/30 hover:bg-white/5",
        variant === "danger" && "border border-red-500/40 text-red-300 hover:bg-red-500/10",
        variant === "quiet" && "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
        className
      )}
    />
  );
}

export function Caption({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cx("font-mono text-[10px] uppercase tracking-[0.28em] text-zinc-500", className)}>{children}</p>;
}

export function Dot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  return <span className={cx("inline-block h-1.5 w-1.5 rounded-full", ok ? "bg-emerald-400" : warn ? "bg-amber-300" : "bg-red-500")} aria-hidden />;
}
