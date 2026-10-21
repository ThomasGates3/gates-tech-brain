/**
 * /oauth/authorize — consent screen for MCP connectors (lib/oauth). The
 * middleware sends you to /sign-in first; sign in with the Thomas or Ace
 * password, then Allow. The connector then acts as that operator.
 */
import { cookies } from "next/headers";
import { GATE_COOKIE, readSession } from "@/lib/gate";
import { canAuthorize, checkAuthorize } from "@/lib/oauth";

export const dynamic = "force-dynamic";

const HIDDEN = ["response_type", "client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state", "scope", "resource"];

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-6">
      <div className="pointer-events-none fixed inset-0" style={{ background: "radial-gradient(700px 400px at 50% 20%, rgba(0,229,255,0.12), transparent 70%)" }} />
      <div className="relative w-full max-w-sm rounded-2xl border border-[var(--accent-deep,#0077b6)]/40 bg-[#08101f]/80 p-7 backdrop-blur">
        <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-slate-500">AI Brain</p>
        {children}
      </div>
    </div>
  );
}

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const q = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const check = checkAuthorize(q);
  const session = await readSession((await cookies()).get(GATE_COOKIE)?.value);

  if (!check.ok) {
    return (
      <Card>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100">Can&apos;t connect</h1>
        <p className="mt-2 text-sm text-slate-400" data-testid="oauth-error">{check.error}</p>
      </Card>
    );
  }

  if (!canAuthorize(session?.operator)) {
    const here = `/oauth/authorize?${new URLSearchParams(q as Record<string, string>).toString()}`;
    return (
      <Card>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100">Sign in as Thomas or Ace</h1>
        <p className="mt-2 text-sm text-slate-400">Connectors act as an operator. The shared team password can&apos;t grant that.</p>
        <a href={`/sign-in?callbackUrl=${encodeURIComponent(here)}`} className="mt-5 flex min-h-[48px] w-full items-center justify-center rounded-xl bg-[#00e5ff] font-medium text-black hover:bg-[#5cefff]">
          Sign in
        </a>
      </Card>
    );
  }

  const who = session.operator === "thomas" ? "Thomas" : "Ace";
  const host = new URL(check.redirectUri).host;
  return (
    <Card>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100">Connect {check.client.name}?</h1>
      <p className="mt-2 text-sm text-slate-400">
        It will use Brain&apos;s tools as <span className="text-slate-100">{who}</span>
        {session.operator === "thomas" ? ", including approve and send" : ""}. You&apos;ll go back to <span className="font-mono text-slate-300">{host}</span>.
      </p>
      <form method="post" action="/api/oauth/authorize" className="mt-5 flex gap-3" data-testid="oauth-consent">
        {HIDDEN.map((k) => (q[k] ? <input key={k} type="hidden" name={k} value={q[k]} /> : null))}
        <button type="submit" name="decision" value="deny" className="min-h-[48px] flex-1 rounded-xl border border-white/10 text-sm text-slate-300 hover:bg-white/5">
          Deny
        </button>
        <button type="submit" name="decision" value="allow" data-testid="oauth-allow" className="min-h-[48px] flex-1 rounded-xl bg-[#00e5ff] font-medium text-black hover:bg-[#5cefff]">
          Allow
        </button>
      </form>
    </Card>
  );
}
