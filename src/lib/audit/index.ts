/**
 * Audit Logger
 *
 * Every tool call, approval, secret access, connector change, job run, and
 * login is recorded. The `detail` field is scrubbed before persistence so
 * secrets never appear in logs.
 *
 * Storage: in-memory ring buffer (last 1 000 entries) during Phase 1.
 * DB-backed path: insert into an `audit_log` Neon table — swap `persist()`
 * below when the API agent wires the DB connection.
 */

import { randomUUID } from "crypto";
import type { AuditEntry } from "@/lib/types";

export type { AuditEntry };

// ── Secret scrubber ─────────────────────────────────────────────────────────

const SECRET_PATTERNS = [
  /key/i,
  /token/i,
  /secret/i,
  /password/i,
  /bearer/i,
  /credential/i,
  /api[_-]?key/i,
  /auth/i,
];

function isSecretKey(key: string): boolean {
  return SECRET_PATTERNS.some((re) => re.test(key));
}

function scrub(detail: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(detail)) {
    if (isSecretKey(k)) {
      out[k] = "[REDACTED]";
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = scrub(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ── Ring buffer ─────────────────────────────────────────────────────────────

const RING_SIZE = 1000;
const ring: AuditEntry[] = [];

function persist(entry: AuditEntry): void {
  if (ring.length >= RING_SIZE) ring.shift();
  ring.push(entry);
  // DB-backed: await db.insert(auditLog).values(entry)
}

// ── Public interface ────────────────────────────────────────────────────────

export interface AuditLogger {
  /** Record an audit event. detail is scrubbed before storage. */
  record(entry: Omit<AuditEntry, "id" | "at"> & { detail?: Record<string, unknown> }): void;
  /** Return recent entries, newest first. */
  recent(limit?: number): AuditEntry[];
}

const audit: AuditLogger = {
  record({ action, actor, target, detail }): void {
    const entry: AuditEntry = {
      id: randomUUID(),
      action,
      actor,
      target,
      detail: detail ? scrub(detail) : undefined,
      at: new Date().toISOString(),
    };
    persist(entry);
  },

  recent(limit = 100): AuditEntry[] {
    return [...ring].reverse().slice(0, limit);
  },
};

export default audit;
