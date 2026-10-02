import Link from "next/link";

/** Header for Control Center sub-pages (Leads, Activity). */
export function PageShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black font-sans text-slate-100">
      <div className="pointer-events-none fixed inset-0" style={{ background: "radial-gradient(900px 500px at 50% 0%, rgba(0,229,255,0.08), transparent 70%)" }} />
      <div className="relative mx-auto max-w-[1400px] px-4 py-5 sm:px-6">
        <header className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--accent-deep)]/30 pb-3">
          <div>
            <Link href="/" data-testid="back-home" className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate-500 hover:text-[var(--accent-soft)]">← Control Center</Link>
            <h1 className="mt-1 text-lg font-semibold tracking-tight sm:text-xl">{title}</h1>
          </div>
          <a href="/field" className="grid min-h-[36px] place-items-center rounded-lg border border-[var(--accent)]/40 px-3 font-mono text-[11px] uppercase tracking-wider text-[var(--accent-soft)] hover:bg-[var(--accent)]/10">Field →</a>
        </header>
        {children}
      </div>
    </div>
  );
}
