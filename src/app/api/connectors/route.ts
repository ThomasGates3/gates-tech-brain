/**
 * GET  /api/connectors           → list connectors (id, label, auth, enabled, tool count)
 * POST /api/connectors {id}       → test a connector's reachability (live health)
 */
import { z } from "zod";
import { registry } from "@/lib/connectors/registry";
import { fieldEnv } from "@/lib/field/config";

export async function GET() {
  const connectors = registry.all().map((c) => ({
    id: c.id,
    label: c.label,
    auth: c.auth,
    enabled: c.enabled,
    baseUrl: c.baseUrl,
    toolCount: c.tools.length,
    hasCredential: Boolean(c.credential),
  }));
  const field = [
    {
      id: "agentmail",
      label: "AgentMail (Email 1 sends)",
      live: Boolean(fieldEnv.agentmailKey() && fieldEnv.agentmailInbox()),
      detail: fieldEnv.agentmailInbox() ? `inbox ${fieldEnv.agentmailInbox()} · sends only via Approve (Nick PASS first)` : "no inbox set",
      setup: [
        "console.agentmail.to → API Keys → Create (type Bearer); copy it.",
        "Domains → add your cold domain and its DNS records; wait for verified.",
        "Inboxes → create the sending inbox (e.g. hello@gatesoutreach.com).",
        "Vercel → Settings → Environment Variables: AGENTMAIL_API_KEY and AGENTMAIL_INBOX_ID, then redeploy.",
      ],
    },
    {
      id: "notion",
      label: "Notion (Cold emails DB)",
      live: Boolean(fieldEnv.notionToken() && fieldEnv.notionDataSource()),
      detail: "High+Med queue in · draft text + status (Sent/Hold/Kill) written back",
      setup: [
        "notion.so/profile/integrations → New integration (Internal); copy the secret.",
        "Open the Cold emails (paste) database → ••• → Connections → add the integration.",
        "Vercel env: NOTION_TOKEN and NOTION_COLD_EMAILS_DATA_SOURCE_ID, then redeploy.",
      ],
    },
  ];
  return Response.json({ connectors, field });
}

const TestSchema = z.object({ id: z.string().min(1) });

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const parsed = TestSchema.safeParse(body);
  if (!parsed.success) return new Response("Expected { id }", { status: 400 });

  const status = await registry.test(parsed.data.id);
  return Response.json(status);
}
