"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.ok) {
        router.replace(params.get("callbackUrl") || "/");
        router.refresh();
      } else {
        setError(data.error || "Incorrect password");
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-6">
      <div className="pointer-events-none fixed inset-0" style={{ background: "radial-gradient(700px 400px at 50% 20%, rgba(255,106,0,0.12), transparent 70%)" }} />
      <form onSubmit={submit} className="relative w-full max-w-sm rounded-2xl border border-[var(--accent-deep,#b34400)]/40 bg-[#0c0d0e]/80 p-7 backdrop-blur" data-testid="signin-form">
        <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-zinc-500">AI Brain</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100">Enter your password</h1>
        <p className="mt-1 text-sm text-zinc-500">This command deck is private.</p>

        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          data-testid="password-input"
          className="mt-5 min-h-[48px] w-full rounded-xl border border-white/10 bg-black/50 px-4 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-[#ff6a00]/60"
        />
        {error && <p className="mt-2 text-[13px] text-[#ff3b30]" data-testid="signin-error">{error}</p>}

        <button
          type="submit"
          disabled={loading || !password}
          data-testid="signin-submit"
          className="mt-4 min-h-[48px] w-full rounded-xl bg-[#ff6a00] font-medium text-black transition-colors hover:bg-[#ff8c1a] disabled:opacity-50"
        >
          {loading ? "Unlocking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}
