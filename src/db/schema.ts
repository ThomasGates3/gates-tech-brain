/**
 * Drizzle schema — Neon Postgres.
 * Tables: jobs, knowledge_items (pgvector), audit_log, approvals, field_* (Field Console).
 * JSON columns hold the typed shapes from @/lib/types (cast on read).
 */
import { pgTable, text, jsonb, timestamp, boolean, integer } from "drizzle-orm/pg-core";

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

export const usage = pgTable("usage", {
  id: text("id").primaryKey(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  costUsd: text("cost_usd").notNull().default("0"), // string for precision
  latencyMs: integer("latency_ms").notNull().default(0),
  source: text("source").notNull().default("chat"), // chat | automation | dev | ace
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

// ── Field Console (internal ops — Email 1 cold outreach) ────────────────────

export const fieldContacts = pgTable("field_contacts", {
  id: text("id").primaryKey(), // Notion page id, or csv_<hash>
  source: text("source").notNull(), // notion | csv
  notionPageId: text("notion_page_id"),
  name: text("name").notNull(),
  email: text("email").notNull(),
  city: text("city").notNull().default(""),
  batch: text("batch").notNull().default(""),
  gap: text("gap").notNull().default(""),
  priority: text("priority").notNull(), // High | Med | Soft
  packDate: text("pack_date").notNull(), // YYYY-MM-DD
  stage: text("stage").notNull().default("new"), // new | drafted | nick | approved | sending | sent | hold | kill
  subject: text("subject").notNull().default(""),
  body: text("body").notNull().default(""),
  draftSource: text("draft_source"),
  draftHash: text("draft_hash"),
  nickVerdict: text("nick_verdict"), // PASS | REVISE | KILL
  nickNote: text("nick_note"),
  nickHash: text("nick_hash"),
  nickAt: text("nick_at"),
  nickBy: text("nick_by"),
  approvedHash: text("approved_hash"),
  approvedAt: text("approved_at"),
  approvedBy: text("approved_by"),
  sentAt: text("sent_at"),
  lastError: text("last_error"),
  updatedAt: text("updated_at").notNull(),
});

export const fieldSendLog = pgTable("field_send_log", {
  id: text("id").primaryKey(),
  contactId: text("contact_id").notNull(),
  contactName: text("contact_name").notNull(),
  recipient: text("recipient").notNull(),
  subject: text("subject").notNull(),
  agentmailMessageId: text("agentmail_message_id").notNull(),
  agentmailThreadId: text("agentmail_thread_id"),
  inbox: text("inbox").notNull(),
  operator: text("operator").notNull(),
  suppressed: boolean("suppressed").notNull().default(true),
  sentAt: text("sent_at").notNull(),
});

export const fieldSuppressions = pgTable("field_suppressions", {
  email: text("email").primaryKey(), // lowercased
  reason: text("reason").notNull(), // sent_email1 | opt_out | bounce | manual
  contactId: text("contact_id"),
  by: text("by").notNull(),
  at: text("at").notNull(),
});
