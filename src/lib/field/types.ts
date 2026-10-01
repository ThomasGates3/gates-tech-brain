/**
 * Field Console — shared types (client + server safe, no imports).
 * Internal ops console for Email 1 cold outreach (see docs/field-console-PRD.md).
 */

export type Priority = "High" | "Med" | "Soft";

/** Console workflow stage. Mirrors the PRD's statuses. */
export type Stage = "new" | "drafted" | "nick" | "approved" | "sending" | "sent" | "hold" | "kill";

export type NickVerdict = "PASS" | "REVISE" | "KILL";

export type Operator = "thomas" | "ace" | "team";

export type DraftSource = "template" | "claude" | "manual" | "notion" | "csv";

export interface FieldContact {
  id: string;
  source: "notion" | "csv";
  notionPageId: string | null;
  name: string;
  email: string;
  city: string;
  batch: string;
  gap: string;
  priority: Priority;
  packDate: string; // YYYY-MM-DD
  stage: Stage;
  subject: string;
  body: string;
  draftSource: DraftSource | null;
  draftHash: string | null;
  nickVerdict: NickVerdict | null;
  nickNote: string | null;
  nickHash: string | null; // draft hash the PASS was given on
  nickAt: string | null;
  nickBy: string | null;
  approvedHash: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  sentAt: string | null;
  lastError: string | null;
  updatedAt: string;
}

export interface SendLogEntry {
  id: string;
  contactId: string;
  contactName: string;
  recipient: string;
  subject: string;
  agentmailMessageId: string;
  agentmailThreadId: string | null;
  inbox: string;
  operator: string;
  suppressed: boolean;
  sentAt: string;
}

export interface Suppression {
  email: string;
  reason: "sent_email1" | "opt_out" | "bounce" | "manual";
  contactId: string | null;
  by: string;
  at: string;
}

/** Things the console needs to know to render honest gates. */
export interface ConsoleConfig {
  operator: Operator | null;
  /** Can this operator Approve + Send (Thomas, or Ace with FIELD_ACE_CAN_SEND). */
  canGreenlight: boolean;
  today: string;
  timezone: string;
  database: boolean;
  notion: boolean;
  agentmail: boolean;
  inbox: string | null;
  claude: boolean;
  mailingAddress: string | null;
  /** Exact CAN-SPAM footer appended at send time (null until the address is set). */
  footer: string | null;
  domainWarmed: boolean;
  dailyCap: number;
  sentToday: number;
}

export interface QueueResponse {
  date: string;
  contacts: (FieldContact & { suppressed: boolean })[];
  config: ConsoleConfig;
}
