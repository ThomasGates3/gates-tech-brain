/**
 * A reply must stop a contact's sequence. AgentMail is simulated, so nothing can be sent.
 * The Neon checks use one throwaway contact (removed afterwards) and are skipped without DATABASE_URL.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { fieldContacts, fieldSendLog } from "@/db/schema";
import { lastReplyAt, listThreads } from "./agentmail";
import { fetchInbound } from "./inbound";
import { nextDue } from "./sequence";
import { sendContact } from "./actions";
import { getContact } from "./store";
import { getSetting } from "@/lib/settings";

const INBOX = "test@inbox.invalid";
const BASE = "https://agentmail.invalid";
const realFetch = globalThis.fetch;
const saved = { ...process.env };
type Message = { from: string; timestamp: string; extracted_text: string };
let threads: Record<string, Message[]> = {};
let writes = 0;
let failWith = 0;

before(() => {
  Object.assign(process.env, { AGENTMAIL_API_KEY: "stub", AGENTMAIL_INBOX_ID: INBOX, AGENTMAIL_BASE_URL: BASE, FIELD_MAILING_ADDRESS: "1 Test St" });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith(BASE)) return realFetch(input, init); // Neon
    if (init?.method === "POST") writes++;
    if (failWith) return new Response("{}", { status: failWith });
    const id = url.split("/threads/")[1];
    if (id) return Response.json({ messages: threads[id] ?? [] });
    return Response.json({
      threads: Object.entries(threads).map(([thread_id, m]) => ({ thread_id, senders: [...new Set(m.map((x) => x.from))], labels: [], preview: "No thanks", message_count: m.length, timestamp: m.at(-1)!.timestamp })),
    });
  }) as typeof fetch;
});
after(() => {
  globalThis.fetch = realFetch;
  process.env = saved;
});

const ours = (timestamp: string): Message => ({ from: INBOX, timestamp, extracted_text: "Email 1" });
// "No thanks" (message and thread preview) classifies as an opt-out: it can't advance the real roadmap or ping, and without confirm it doesn't suppress.
const theirs = (from: string, timestamp: string): Message => ({ from, timestamp, extracted_text: "No thanks" });

test("a rejected AgentMail call throws instead of looking like no replies", async () => {
  failWith = 403;
  try {
    await assert.rejects(listThreads(INBOX), /AgentMail 403/);
    await assert.rejects(lastReplyAt(INBOX, "t"), /AgentMail 403/);
  } finally {
    failWith = 0;
  }
});

test("lastReplyAt ignores our own messages and finds the latest of theirs", async () => {
  threads = { t: [ours("2026-01-01"), theirs("Pat <PAT@example.invalid>", "2026-01-02"), theirs("pat@example.invalid", "2026-01-03"), ours("2026-01-04")] };
  assert.equal(await lastReplyAt(INBOX, "t"), "2026-01-03");
  threads = { t: [ours("2026-01-01")] };
  assert.equal(await lastReplyAt(INBOX, "t"), null);
});

test("a reply stops the sequence", { skip: !process.env.DATABASE_URL }, async (t) => {
  const id = `test_${randomUUID()}`;
  const threadId = `thread_${id}`;
  const email = `${id}@example.invalid`;
  const sentAt = new Date(Date.now() - 5 * 864e5).toISOString();
  await db.insert(fieldContacts).values({ id, source: "csv", name: "Reply Test", email, priority: "Soft", packDate: "2026-01-01", updatedAt: sentAt, stage: "sent", sentAt } as typeof fieldContacts.$inferInsert);
  await db.insert(fieldSendLog).values({ id, contactId: id, contactName: "Reply Test", recipient: email, subject: "s", agentmailMessageId: `m_${id}`, agentmailThreadId: threadId, inbox: INBOX, operator: "thomas", sentAt });
  const later = (h: number) => new Date(Date.parse(sentAt) + h * 36e5).toISOString();
  const roadmap = await getSetting("roadmap_state");
  const due = async () => (await nextDue()).some((d) => d.contact_id === id);
  const reset = () => db.update(fieldContacts).set({ repliedAt: null }).where(eq(fieldContacts.id, id));
  t.after(async () => {
    await db.delete(fieldSendLog).where(eq(fieldSendLog.id, id));
    await db.delete(fieldContacts).where(eq(fieldContacts.id, id));
  });

  // No reply yet: Email 2 is due, and our own message in the thread doesn't count.
  threads = { [threadId]: [ours(sentAt)] };
  await fetchInbound({ by: "test" });
  assert.equal((await getContact(id))?.repliedAt, null);
  assert.equal(await due(), true);

  // A reply from the address we emailed.
  threads = { [threadId]: [ours(sentAt), theirs(email, later(1))] };
  await fetchInbound({ by: "test" });
  assert.equal((await getContact(id))?.repliedAt, later(1));
  assert.equal(await due(), false);
  const blocked = await sendContact(id, "any", "thomas", 2);
  assert.ok(!blocked.ok && blocked.status === 409 && /replied/.test(blocked.error));

  // A reply from a different address in the same thread.
  await reset();
  threads = { [threadId]: [ours(sentAt), theirs("owner@example.invalid", later(2))] };
  await fetchInbound({ by: "test" });
  assert.equal((await getContact(id))?.repliedAt, later(2));

  // A reply no check has seen yet: the send itself finds it and records it.
  await reset();
  threads = { [threadId]: [ours(sentAt), theirs(email, later(3))] };
  const late = await sendContact(id, "any", "thomas", 2);
  assert.ok(!late.ok && late.status === 409 && /replied/.test(late.error));
  assert.equal((await getContact(id))?.repliedAt, later(3));

  // AgentMail is down at send time: refuse rather than risk mailing someone who replied.
  await reset();
  failWith = 500;
  const down = await sendContact(id, "any", "thomas", 2);
  failWith = 0;
  assert.ok(!down.ok && down.status === 502 && /nothing was sent/.test(down.error));

  assert.equal(writes, 0, "no send or reply call ever reached AgentMail");
  assert.equal(await getSetting("roadmap_state"), roadmap, "the real roadmap was not touched");
});
