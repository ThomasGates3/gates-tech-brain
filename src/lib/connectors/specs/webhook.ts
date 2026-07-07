import type { Connector } from "@/lib/types";

export const webhook: Connector = {
  id: "webhook",
  label: "Generic Webhook",
  auth: "api_key",
  baseUrl: process.env.WEBHOOK_BASE_URL ?? "https://example.com",
  credential: { vaultKey: "WEBHOOK_SECRET" },
  enabled: true,
  tools: [
    {
      name: "send_event",
      description: "POST an event payload to the configured webhook URL",
      method: "POST",
      path: "/",
      risk: "write",
      params: {
        payload: { type: "object", required: true, in: "body", description: "Event data to send" },
      },
    },
    {
      name: "trigger_action",
      description: "Trigger a named action on the webhook endpoint",
      method: "POST",
      path: "/{action}",
      risk: "write",
      params: {
        action: { type: "string", required: true, in: "path", description: "Action name" },
        payload: { type: "object", in: "body", description: "Optional payload" },
      },
    },
  ],
};
