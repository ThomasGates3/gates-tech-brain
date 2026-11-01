"use client";

import { useCallback, useEffect, useState } from "react";

/** Today's leads + sends + gates from /api/leads, refreshed every `everyMs`. Keeps the last good data on errors. */
export interface LeadsSnapshot<L> { date: string; sentToday: number; gates: { domainWarmed: boolean; warmNote: string; dailyCap: number }; leads: L[] }

export function useLeads<L = { email1_status: string }>(everyMs = 30_000) {
  const [data, setData] = useState<LeadsSnapshot<L> | null>(null);
  const reload = useCallback(async () => {
    try { const r = await fetch("/api/leads"); if (r.ok) setData(await r.json()); } catch { /* keep last */ }
  }, []);
  useEffect(() => {
    const first = setTimeout(reload, 0);
    const t = setInterval(reload, everyMs);
    const on = () => void reload();
    window.addEventListener("brain:refresh", on);
    return () => { clearTimeout(first); clearInterval(t); window.removeEventListener("brain:refresh", on); };
  }, [reload, everyMs]);
  return { data, reload };
}
