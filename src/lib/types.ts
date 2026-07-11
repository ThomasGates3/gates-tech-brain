/**
 * AI BRAIN — Shared Contracts
 * ---------------------------------------------------------------------------
 * The single source of truth every build agent (UI · API/Logic · Security · UX)
 * codes against. Change here = coordinate across agents. Nothing else in the
 * app should redefine these shapes.
 *
 * Runtime validation lives in `schemas.ts` (zod) and MUST stay in sync.
 */

// ─────────────────────────────────────────────────────────────────────────
// Models & Verticals
// ─────────────────────────────────────────────────────────────────────────

/** Which brain runs the Conductor. Set per deployment via MODEL_TIER. */
export type ModelTier = "standard" | "flagship";

/** AI Gateway model id resolved from the active tier. */
export type ModelId =
  | "anthropic/claude-sonnet-4-6" // standard Conductor
  | "anthropic/claude-opus-4-8" // flagship Conductor
  | "anthropic/claude-haiku-4-5"; // cheap sub-tasks

/** The 5 sellable personalities (PRD §9). */
export type Vertical =
  | "agency"
  | "accounting"
  | "law"
  | "medical"
  | "insurance";

/** A deployable persona preset (verticals/{name}.ts). */
export interface VerticalPreset {
  id: Vertical;
  name: string; // brain's display name for this persona
  systemPrompt: string;
  voiceId?: string; // TTS voice
  accent: string; // deck theme accent (hex)
  modelTier?: ModelTier; // per-client override
  defaultConnectors: string[]; // connector ids enabled out of the box
  signatureJobs: string[]; // job template ids
}

// ─────────────────────────────────────────────────────────────────────────
// Connectors — the "hackable" core (PRD §3, F3)
// ─────────────────────────────────────────────────────────────────────────

export type AuthType = "none" | "api_key" | "bearer" | "oauth" | "aws_sig";
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** How risky a tool is — drives the approval gate (Security agent). */
export type RiskLevel = "read" | "write" | "destructive";

/** A single callable operation exposed by a connector. */
export interface ToolSpec {
  name: string; // unique within the connector, e.g. "list_invoices"
  description: string; // shown to the model + in the deck
  method: HttpMethod;
  path: string; // supports {param} placeholders
  risk: RiskLevel; // read runs freely; write/destructive gate on approval
  /** JSON-schema-ish param definitions the model fills in. */
  params?: Record<string, ToolParam>;
  /** Optional response path to extract the useful payload. */
  resultPath?: string;
}

export interface ToolParam {
  type: "string" | "number" | "boolean" | "object" | "array";
  description?: string;
  required?: boolean;
  in?: "path" | "query" | "body"; // where it goes in the request
}

/** Credentials are NEVER stored inline — only a vault reference. */
export interface ConnectorCredentialRef {
  vaultKey: string; // pointer into the Secrets Vault
  scopes?: string[]; // minimal-scope enforcement (Security)
}

/** The whole "integration" — a declarative config file. */
export interface Connector {
  id: string; // stable slug, e.g. "quickbooks"
  label: string; // human name
  auth: AuthType;
  baseUrl: string;
  credential?: ConnectorCredentialRef;
  tools: ToolSpec[];
  rateLimit?: { requests: number; perSeconds: number };
  enabled: boolean;
}

/** Live connection health shown in the deck's connector manager. */
export interface ConnectorStatus {
  connectorId: string;
  reachable: boolean;
  lastCheckedAt: string; // ISO
  message?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Tool calls — what the brain actually does
// ─────────────────────────────────────────────────────────────────────────

export type ToolCallStatus =
  | "pending"
  | "awaiting_approval"
  | "running"
  | "success"
  | "error"
  | "denied";

/** A single request the orchestrator makes through a connector tool. */
export interface ToolCall {
  id: string;
  connectorId: string;
  toolName: string;
  args: Record<string, unknown>;
  risk: RiskLevel;
  status: ToolCallStatus;
  agentId: SpecialistId | "conductor"; // who initiated it
  createdAt: string; // ISO
}

export interface ToolResult {
  toolCallId: string;
  status: Extract<ToolCallStatus, "success" | "error">;
  data?: unknown;
  error?: string;
  latencyMs: number;
  costUsd?: number; // token/tool cost for the inspector
}

// ─────────────────────────────────────────────────────────────────────────
// Orchestration — Conductor + specialists (PRD §3, F2)
// ─────────────────────────────────────────────────────────────────────────

export type SpecialistId = "research" | "data" | "devops" | "comms" | "operator";

/** Anything the deck streams live. Discriminated by `type`. */
export type AgentEvent =
  | { type: "thinking"; agentId: SpecialistId | "conductor"; text: string; at: string }
  | { type: "delegating"; to: SpecialistId; task: string; at: string }
  | { type: "tool_call"; call: ToolCall; at: string }
  | { type: "tool_result"; result: ToolResult; at: string }
  | { type: "approval_request"; request: ApprovalRequest; at: string }
  | { type: "message"; role: "assistant" | "user"; text: string; at: string }
  | { type: "briefing"; text: string; highlights: string[]; at: string } // Jarvis proactive
  | { type: "error"; message: string; at: string }
  | { type: "done"; at: string };

// ─────────────────────────────────────────────────────────────────────────
// Approvals — human-in-the-loop gate (Security, F6)
// ─────────────────────────────────────────────────────────────────────────

export type ApprovalDecision = "approved" | "denied";

export interface ApprovalRequest {
  id: string;
  toolCall: ToolCall; // the risky action awaiting a human
  reason: string; // why approval is required
  requestedAt: string; // ISO
  expiresAt?: string;
}

export interface ApprovalResolution {
  requestId: string;
  decision: ApprovalDecision;
  decidedBy: string; // user id
  decidedAt: string;
  note?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Autonomous jobs — scheduler + triggers (F5)
// ─────────────────────────────────────────────────────────────────────────

export type JobTrigger =
  | { kind: "cron"; expression: string }
  | { kind: "webhook"; secretRef: string }
  | { kind: "manual" };

export type JobStatus = "idle" | "queued" | "running" | "success" | "failed";

export interface Job {
  id: string;
  name: string;
  prompt: string; // task handed to the Conductor
  trigger: JobTrigger;
  status: JobStatus;
  vertical?: Vertical;
  lastRunAt?: string;
  nextRunAt?: string;
  report?: { summary: string; deliverTo?: ("deck" | "slack" | "email")[] };
}

// ─────────────────────────────────────────────────────────────────────────
// Audit — every action recorded (Security, F6)
// ─────────────────────────────────────────────────────────────────────────

export type AuditAction =
  | "tool_call"
  | "approval"
  | "secret_access"
  | "connector_change"
  | "job_run"
  | "login";

export interface AuditEntry {
  id: string;
  action: AuditAction;
  actor: string; // user id or "system"
  target: string; // connector id, tool name, secret key, etc.
  detail?: Record<string, unknown>; // MUST be scrubbed of secret values
  at: string; // ISO
}

// ─────────────────────────────────────────────────────────────────────────
// Knowledge / memory (F4)
// ─────────────────────────────────────────────────────────────────────────

export interface KnowledgeItem {
  id: string;
  title: string;
  source: "notebooklm" | "upload" | "connector" | "note";
  sourceRef?: string; // NotebookLM notebook/source id, url, etc.
  content: string; // indexed text
  embeddingId?: string; // pgvector row ref
  createdAt: string;
}
