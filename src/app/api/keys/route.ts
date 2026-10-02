/**
 * API keys for MCP / REST (Thomas only, signed in).
 * GET  → list keys (never the key itself)
 * POST { label?, operator? } → create; the plaintext key is returned ONCE
 * DELETE ?id= → revoke
 */
import { z } from "zod";
import { isThomasSession as isThomas } from "@/lib/session";
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/api-keys";
import { recordActivity } from "@/lib/activity";

const deny = () => Response.json({ ok: false, error: "Only Thomas (signed in) can manage API keys." }, { status: 403 });

export async function GET() {
  if (!(await isThomas())) return deny();
  return Response.json({ ok: true, keys: await listApiKeys() });
}

const Create = z.object({ label: z.string().trim().min(1).max(60).default("Ace"), operator: z.enum(["ace", "thomas"]).default("ace") });

export async function POST(req: Request) {
  if (!(await isThomas())) return deny();
  const parsed = Create.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ ok: false, error: "Expected { label?, operator?: 'ace' | 'thomas' }." }, { status: 400 });
  const { key, row } = await createApiKey(parsed.data.label, parsed.data.operator);
  void recordActivity({ kind: "connected", target: `API key created: ${row.label}`, because: `operator ${row.operator}`, agent: "thomas" });
  return Response.json({ ok: true, key, row });
}

export async function DELETE(req: Request) {
  if (!(await isThomas())) return deny();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ ok: false, error: "id required" }, { status: 400 });
  await revokeApiKey(id);
  void recordActivity({ kind: "updated", target: `API key revoked: ${id}`, agent: "thomas" });
  return Response.json({ ok: true });
}
