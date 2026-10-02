/**
 * API keys for MCP / REST callers. Keys look like `gtb_<random>`; only the
 * SHA-256 hash is stored, so a key can be shown exactly once at creation.
 * FIELD_ACE_API_KEY (env) keeps working alongside DB keys.
 */
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { and, eq, isNull, desc } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import type { Operator } from "@/lib/field/types";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export interface ApiKeyRow { id: string; label: string; operator: Operator; prefix: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null }

export async function createApiKey(label: string, operator: Exclude<Operator, "team">): Promise<{ key: string; row: ApiKeyRow }> {
  const key = `gtb_${randomBytes(24).toString("base64url")}`;
  const row = { id: `key_${randomBytes(6).toString("hex")}`, label, operator, prefix: key.slice(0, 10), hash: sha(key), createdAt: new Date().toISOString(), lastUsedAt: null, revokedAt: null };
  await db.insert(apiKeys).values(row);
  const { hash: _hash, ...safe } = row;
  void _hash;
  return { key, row: safe };
}

export async function listApiKeys(): Promise<ApiKeyRow[]> {
  const rows = await db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt));
  return rows.map(({ hash: _hash, ...r }) => (void _hash, { ...r, operator: r.operator as Operator }));
}

export async function revokeApiKey(id: string): Promise<void> {
  await db.update(apiKeys).set({ revokedAt: new Date().toISOString() }).where(and(eq(apiKeys.id, id), isNull(apiKeys.revokedAt)));
}

/** Operator for a bearer token: env Ace key first, then an un-revoked DB key. */
export async function operatorForApiKey(token: string | null | undefined): Promise<Operator | null> {
  if (!token) return null;
  const env = process.env.FIELD_ACE_API_KEY ?? "";
  if (env && env.length === token.length && timingSafeEqual(Buffer.from(env), Buffer.from(token))) return "ace";
  if (!token.startsWith("gtb_")) return null;
  try {
    const [row] = await db.select().from(apiKeys).where(and(eq(apiKeys.hash, sha(token)), isNull(apiKeys.revokedAt))).limit(1);
    if (!row) return null;
    void db.update(apiKeys).set({ lastUsedAt: new Date().toISOString() }).where(eq(apiKeys.id, row.id)).catch(() => {});
    return row.operator as Operator;
  } catch {
    return null;
  }
}

export const bearerToken = (header: string | null | undefined) => header?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? null;
