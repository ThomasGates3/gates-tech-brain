/**
 * Audit log, in Neon. Secret-looking fields in `detail` are redacted before storage.
 * record() never throws: a logging failure must not break the action being logged.
 */
import { randomUUID } from "crypto";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import type { AuditEntry } from "@/lib/types";

const SECRET_KEY = /key|token|secret|password|bearer|credential|auth/i;

export function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SECRET_KEY.test(k) ? "[REDACTED]" : scrub(v)]));
}

const audit = {
  async record({ action, actor, target, detail }: Omit<AuditEntry, "id" | "at">): Promise<void> {
    try {
      await db.insert(auditLog).values({ id: randomUUID(), action, actor, target, detail: detail && scrub(detail), at: new Date().toISOString() });
    } catch (e) {
      console.error("[audit] write failed", action, target, e);
    }
  },
};

export default audit;
