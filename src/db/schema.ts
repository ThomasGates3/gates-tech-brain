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
  source: text("source").notNull(), // notion | csv | ashley | prospectacle | manual
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
  lane: text("lane").notNull().default("core"), // core (missed-call Field) | website (redesign + Core add-on)
  contactName: text("contact_name"),
  siteUrl: text("site_url"),
  notes: text("notes"),
  repliedAt: text("replied_at"), // any inbound reply ends the sequence
  holdReason: text("hold_reason"), // soft | no_published_hours | thomas | other (null when not on hold)
});

/** Sequence steps Email 2–4 (Email 1 lives on field_contacts). One row per contact × step. */
export const fieldSteps = pgTable("field_steps", {
  id: text("id").primaryKey(), // `${contactId}:${n}`
  contactId: text("contact_id").notNull(),
  n: integer("n").notNull(), // 2 | 3 | 4
  stage: text("stage").notNull().default("new"), // new | drafted | nick | approved | sending | sent | hold | kill
  subject: text("subject").notNull().default(""),
  body: text("body").notNull().default(""),
  draftSource: text("draft_source"),
  draftHash: text("draft_hash"),
  nickVerdict: text("nick_verdict"),
  nickNote: text("nick_note"),
  nickHash: text("nick_hash"),
  nickAt: text("nick_at"),
  nickBy: text("nick_by"),
  approvedHash: text("approved_hash"),
  approvedAt: text("approved_at"),
  approvedBy: text("approved_by"),
  sentAt: text("sent_at"),
  messageId: text("message_id"),
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
  emailN: integer("email_n").notNull().default(1),
});

export const fieldSuppressions = pgTable("field_suppressions", {
  email: text("email").primaryKey(), // lowercased
  reason: text("reason").notNull(), // sent_email1 | opt_out | bounce | manual
  contactId: text("contact_id"),
  by: text("by").notNull(),
  at: text("at").notNull(),
});

/** API keys for MCP / REST callers (e.g. "Ace"). Only a SHA-256 hash is stored; the key is shown once. */
export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  operator: text("operator").notNull(), // "ace" | "thomas"
  prefix: text("prefix").notNull(), // first chars, for recognising a key in the UI
  hash: text("hash").notNull(),
  createdAt: text("created_at").notNull(),
  lastUsedAt: text("last_used_at"),
  revokedAt: text("revoked_at"),
});
