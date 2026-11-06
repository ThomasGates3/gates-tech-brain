/**
 * AgentMail — sends Email 1 (new thread) and Emails 2–4 (replies in that thread)
 * from the cold-domain inbox, and reads inbound threads. Server-only.
 * POST {base}/v0/inboxes/{inbox_id}/messages/send → { message_id, thread_id }
 * POST {base}/v0/inboxes/{inbox_id}/messages/{message_id}/reply → { message_id, thread_id }
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

/** Reply into an existing thread (sequence Emails 2–4). */
export async function replyEmail(messageId: string, text: string, labels: string[]): Promise<SentMessage> {
  const key = fieldEnv.agentmailKey();
  const inbox = fieldEnv.agentmailInbox();
  if (!key || !inbox) throw new Error("AgentMail is not configured (AGENTMAIL_API_KEY / AGENTMAIL_INBOX_ID).");
  const res = await fetch(`${fieldEnv.agentmailBase()}/v0/inboxes/${encodeURIComponent(inbox)}/messages/${encodeURIComponent(messageId)}/reply`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text, labels }),
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

export interface InboundThread {
  threadId: string;
  inbox: string;
  subject: string;
  preview: string;
  senders: string[];
  labels: string[];
  messageCount: number;
  lastAt: string;
  lastFrom: string;
  lastText: string;
}

const addr = (s: string) => (s.match(/<([^>]+)>/)?.[1] ?? s).trim().toLowerCase();

/** When someone other than the inbox last wrote in this thread, or null. Throws if AgentMail can't answer. */
export async function lastReplyAt(inbox: string, threadId: string): Promise<string | null> {
  const key = fieldEnv.agentmailKey();
  if (!key) throw new Error("AGENTMAIL_API_KEY is not set.");
  const res = await fetch(`${fieldEnv.agentmailBase()}/v0/inboxes/${encodeURIComponent(inbox)}/threads/${encodeURIComponent(threadId)}`, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" });
  if (!res.ok) throw new Error(`AgentMail ${res.status} reading thread`);
  const { messages } = (await res.json()) as { messages?: { from?: string; timestamp: string }[] };
  if (!Array.isArray(messages)) throw new Error("AgentMail returned a thread with no messages.");
  const replies = messages.filter((m) => m.from && addr(m.from) !== inbox.toLowerCase()).map((m) => m.timestamp).sort();
  return replies.at(-1) ?? null;
}

/** Recent threads in an inbox with the last message's sender + text (read-only). */
export async function listThreads(inbox: string, limit = 25): Promise<InboundThread[]> {
  const key = fieldEnv.agentmailKey();
  if (!key) throw new Error("AGENTMAIL_API_KEY is not set.");
  const base = `${fieldEnv.agentmailBase()}/v0/inboxes/${encodeURIComponent(inbox)}`;
  const h = { Authorization: `Bearer ${key}` };
  const res = await fetch(`${base}/threads?limit=${limit}`, { headers: h, cache: "no-store" });
  // A rejected call must not look like "no replies": that would let a sequence keep running.
  if (!res.ok) throw new Error(`AgentMail ${res.status} listing threads`);
  const list = (await res.json()) as { threads?: { thread_id: string; subject?: string; preview?: string; senders?: string[]; labels?: string[]; message_count?: number; timestamp: string }[] };
  return Promise.all(
    (list.threads ?? []).map(async (t) => {
      const full = (await (await fetch(`${base}/threads/${t.thread_id}`, { headers: h, cache: "no-store" })).json().catch(() => ({}))) as { messages?: { from?: string; timestamp: string; extracted_text?: string; text?: string; preview?: string }[] };
      const msgs = (full.messages ?? []).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const last = msgs[msgs.length - 1];
      return {
        threadId: t.thread_id, inbox, subject: t.subject ?? "", preview: t.preview ?? "", senders: (t.senders ?? []).map(addr),
        labels: t.labels ?? [], messageCount: t.message_count ?? msgs.length, lastAt: last?.timestamp ?? t.timestamp,
        lastFrom: addr(last?.from ?? ""), lastText: (last?.extracted_text ?? last?.text ?? last?.preview ?? t.preview ?? "").slice(0, 2000),
      };
    })
  );
}
