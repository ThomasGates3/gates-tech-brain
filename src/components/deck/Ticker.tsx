"use client";

import { useEffect, useRef, useState } from "react";

/** A number that counts to its new value (ease-out). Jumps straight there under reduced motion. */
export function Ticker({ value, format = (n) => String(Math.round(n)), ms = 700, className }: { value: number; format?: (n: number) => string; ms?: number; className?: string }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const a = from.current;
    const b = value;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = reduce || a === b ? 1 : Math.min(1, (t - start) / ms);
      setShown(a + (b - a) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = b;
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); from.current = b; };
  }, [value, ms]);
  return <span className={`tabular-nums ${className ?? ""}`}>{format(shown)}</span>;
}
