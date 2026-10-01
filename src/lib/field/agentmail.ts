/**
 * AgentMail — sends Email 1 from the cold-domain inbox. Server-only.
 * POST {base}/v0/inboxes/{inbox_id}/messages/send → { message_id, thread_id }
 * (shape verified against the official `agentmail` SDK, v0.5.x).
 */
import { fieldEnv } from "./config";

export interface SentMessage {
  messageId: string;
  threadId: string | null;
}

export async function sendEmail(msg: { to: string; subject: string; text: string }): Promise<SentMessage> {
  const key = fieldEnv.agentmailKey();
  const inbox = fieldEnv.agentmailInbox();
  if (!key || !inbox) throw new Error("AgentMail is not configured (AGENTMAIL_API_KEY / AGENTMAIL_INBOX_ID).");

  const res = await fetch(`${fieldEnv.agentmailBase()}/v0/inboxes/${encodeURIComponent(inbox)}/messages/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to: [msg.to], subject: msg.subject, text: msg.text, labels: ["field-email1"] }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const detail = data.message ?? data.error ?? data.name ?? res.statusText;
    throw new Error(`AgentMail ${res.status}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  }
  if (typeof data.message_id !== "string") throw new Error("AgentMail returned no message_id.");
  return { messageId: data.message_id, threadId: typeof data.thread_id === "string" ? data.thread_id : null };
}
