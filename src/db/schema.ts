/**
 * Drizzle schema — Neon Postgres.
 * Tables: jobs, knowledge_items (pgvector), audit_log, approvals.
 * JSON columns hold the typed shapes from @/lib/types (cast on read).
 */
import { pgTable, text, jsonb, timestamp, boolean } from "drizzle-orm/pg-core";

export const jobs = pgTable("jobs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  prompt: text("prompt").notNull(),
  trigger: jsonb("trigger").notNull(),
  status: text("status").notNull().default("idle"),
  vertical: text("vertical"),
  lastRunAt: text("last_run_at"),
  nextRunAt: text("next_run_at"),
  report: jsonb("report"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const knowledgeItems = pgTable("knowledge_items", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  source: text("source").notNull(),
  sourceRef: text("source_ref"),
  content: text("content").notNull(),
  // pgvector column stored as text ref; embedding math done via SQL extension.
  embeddingId: text("embedding_id"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey(),
  action: text("action").notNull(),
  actor: text("actor").notNull(),
  target: text("target").notNull(),
  detail: jsonb("detail"),
  at: text("at").notNull(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const activity = pgTable("activity", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(), // generated | updated | spawned | connected | sent | queried | alert
  target: text("target").notNull(), // the thing acted on
  because: text("because"), // rationale ("updated X because Y")
  agent: text("agent"), // which specialist / actor
  at: text("at").notNull(), // ISO timestamp
});

export const approvals = pgTable("approvals", {
  id: text("id").primaryKey(),
  toolCall: jsonb("tool_call").notNull(),
  reason: text("reason").notNull(),
  resolved: boolean("resolved").notNull().default(false),
  decision: text("decision"),
  decidedBy: text("decided_by"),
  requestedAt: text("requested_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
