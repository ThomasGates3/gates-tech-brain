import { TopNav } from "./TopNav";

/** Layout for Control Center sub-pages: top nav + page title. */
export function PageShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black font-sans text-slate-100">
      <div className="pointer-events-none fixed inset-0" style={{ background: "radial-gradient(900px 500px at 50% 0%, rgba(0,229,255,0.08), transparent 70%)" }} />
      <TopNav />
      <main className="relative w-full px-4 py-5 lg:px-6">
        <div className="mb-4">
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl">{title}</h1>
          {subtitle && <p className="mt-0.5 text-[13px] text-slate-500">{subtitle}</p>}
        </div>
        {children}
      </main>
    </div>
  );
}
