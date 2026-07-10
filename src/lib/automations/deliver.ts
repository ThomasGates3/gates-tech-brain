/**
 * Deliver automation results to channels. Slack (free Incoming Webhook) is the
 * primary path; email is a documented stub (add Resend/SMTP later).
 * Never throws — delivery failures are logged, not fatal to the run.
 */
import audit from "@/lib/audit";

export type DeliveryChannel = "deck" | "slack" | "email";

export interface DeliveryPayload {
  title: string;
  body: string;
}

export async function deliver(channels: DeliveryChannel[] = [], payload: DeliveryPayload): Promise<void> {
  await Promise.allSettled(
    channels.map((ch) => {
      if (ch === "slack") return deliverSlack(payload);
      if (ch === "email") return deliverEmail(payload);
      return Promise.resolve(); // "deck" is handled by the API response / activity feed
    })
  );
}

async function deliverSlack({ title, body }: DeliveryPayload): Promise<void> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return; // not configured — silently skip
  try {
    // Slack Block Kit: a header + the body as a section (mrkdwn).
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: title, // fallback / notification text
        blocks: [
          { type: "header", text: { type: "plain_text", text: `🧠 ${title}`.slice(0, 150) } },
          { type: "section", text: { type: "mrkdwn", text: body.slice(0, 2900) } },
          { type: "context", elements: [{ type: "mrkdwn", text: `AI Brain · ${new Date().toLocaleString()}` }] },
        ],
      }),
    });
    audit.record({ action: "job_run", actor: "delivery", target: "slack", detail: { ok: res.ok, status: res.status } });
  } catch (e) {
    audit.record({ action: "job_run", actor: "delivery", target: "slack", detail: { error: e instanceof Error ? e.message : "unknown" } });
  }
}

async function deliverEmail({ title }: DeliveryPayload): Promise<void> {
  // Stub: wire a provider (Resend/SMTP) here. Set RESEND_API_KEY + EMAIL_TO.
  if (!process.env.RESEND_API_KEY) return;
  audit.record({ action: "job_run", actor: "delivery", target: "email", detail: { title, note: "email provider not implemented" } });
}
