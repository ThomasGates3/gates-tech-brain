/**
 * Zod runtime schemas — mirror of src/lib/types.ts.
 * Keep in sync with types.ts. Used for API input validation.
 */

import { z } from "zod";

// ── Primitives ──────────────────────────────────────────────────────────────

export const RiskLevelSchema = z.enum(["read", "write", "destructive"]);

export const AuthTypeSchema = z.enum(["none", "api_key", "bearer", "oauth", "aws_sig"]);

export const HttpMethodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);

export const ToolCallStatusSchema = z.enum([
  "pending",
  "awaiting_approval",
  "running",
  "success",
  "error",
  "denied",
]);

export const SpecialistIdSchema = z.enum(["research", "data", "devops", "comms"]);

export const ApprovalDecisionSchema = z.enum(["approved", "denied"]);

export const AuditActionSchema = z.enum([
  "tool_call",
  "approval",
  "secret_access",
  "connector_change",
  "job_run",
  "login",
]);

export const VerticalSchema = z.enum(["agency", "accounting", "law", "medical", "insurance"]);

// ── Connector ───────────────────────────────────────────────────────────────

export const ToolParamSchema = z.object({
  type: z.enum(["string", "number", "boolean", "object", "array"]),
  description: z.string().optional(),
  required: z.boolean().optional(),
  in: z.enum(["path", "query", "body"]).optional(),
});

export const ToolSpecSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  method: HttpMethodSchema,
  path: z.string().min(1),
  risk: RiskLevelSchema,
  params: z.record(z.string(), ToolParamSchema).optional(),
  resultPath: z.string().optional(),
});

export const ConnectorCredentialRefSchema = z.object({
  vaultKey: z.string().min(1),
  scopes: z.array(z.string()).optional(),
});

export const ConnectorSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  auth: AuthTypeSchema,
  baseUrl: z.url(),
  credential: ConnectorCredentialRefSchema.optional(),
  tools: z.array(ToolSpecSchema),
  rateLimit: z
    .object({ requests: z.number().int().positive(), perSeconds: z.number().positive() })
    .optional(),
  enabled: z.boolean(),
});

// ── ToolCall ────────────────────────────────────────────────────────────────

export const ToolCallSchema = z.object({
  id: z.string().uuid(),
  connectorId: z.string().min(1),
  toolName: z.string().min(1),
  args: z.record(z.string(), z.unknown()),
  risk: RiskLevelSchema,
  status: ToolCallStatusSchema,
  agentId: z.union([SpecialistIdSchema, z.literal("conductor")]),
  createdAt: z.iso.datetime(),
});

export const ToolResultSchema = z.object({
  toolCallId: z.string().uuid(),
  status: z.enum(["success", "error"]),
  data: z.unknown().optional(),
  error: z.string().optional(),
  latencyMs: z.number().nonnegative(),
  costUsd: z.number().nonnegative().optional(),
});

// ── Approvals ───────────────────────────────────────────────────────────────

export const ApprovalRequestSchema = z.object({
  id: z.string().uuid(),
  toolCall: ToolCallSchema,
  reason: z.string().min(1),
  requestedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime().optional(),
});

export const ApprovalResolutionSchema = z.object({
  requestId: z.string().uuid(),
  decision: ApprovalDecisionSchema,
  decidedBy: z.string().min(1),
  decidedAt: z.iso.datetime(),
  note: z.string().optional(),
});

// ── Jobs ────────────────────────────────────────────────────────────────────

export const JobTriggerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("cron"), expression: z.string().min(1) }),
  z.object({ kind: z.literal("webhook"), secretRef: z.string().min(1) }),
  z.object({ kind: z.literal("manual") }),
]);

export const JobSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  prompt: z.string().min(1),
  trigger: JobTriggerSchema,
  status: z.enum(["idle", "queued", "running", "success", "failed"]),
  vertical: VerticalSchema.optional(),
  lastRunAt: z.iso.datetime().optional(),
  nextRunAt: z.iso.datetime().optional(),
  report: z
    .object({
      summary: z.string(),
      deliverTo: z.array(z.enum(["deck", "slack", "email"])).optional(),
    })
    .optional(),
});

// ── Audit ───────────────────────────────────────────────────────────────────

export const AuditEntrySchema = z.object({
  id: z.string().uuid(),
  action: AuditActionSchema,
  actor: z.string().min(1),
  target: z.string().min(1),
  detail: z.record(z.string(), z.unknown()).optional(),
  at: z.iso.datetime(),
});
