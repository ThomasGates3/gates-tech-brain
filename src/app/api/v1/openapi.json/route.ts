/** GET /api/v1/openapi.json — OpenAPI 3.1 spec for the Brain tools (public; calling them needs a key). */
import { z } from "zod";
import { TOOLS } from "@/lib/brain/tools";

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const paths = Object.fromEntries(
    TOOLS.map((t) => [
      `/api/v1/tools/${t.name}`,
      {
        post: {
          operationId: t.name,
          summary: t.title,
          description: t.description,
          requestBody: { required: true, content: { "application/json": { schema: z.toJSONSchema(t.input, { io: "input" }) } } },
          responses: {
            "200": { description: "OK", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, result: {} } } } } },
            "400": { description: "Invalid arguments" },
            "401": { description: "Missing or invalid API key" },
            "403": { description: "Not allowed for this key (e.g. send without FIELD_ACE_CAN_SEND)" },
            "409": { description: "Field gate (e.g. Approve needs Nick PASS on the current draft)" },
            "429": { description: "Daily Claude budget or daily send cap reached" },
          },
        },
      },
    ])
  );
  return Response.json({
    openapi: "3.1.0",
    info: { title: "Gates Tech Brain API", version: "1.0.0", description: "Tools for Ace and the Gates Grok bots. Same tools as the MCP server at /api/mcp. Locked Field path: Ace queue → Darrell Email 1 → Nick PASS/REVISE/KILL → Thomas Approve → AgentMail. Draft-only automations; no autopilot." },
    servers: [{ url: origin }],
    security: [{ bearer: [] }],
    components: { securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "API key from Operations → Access" } } },
    paths,
  });
}
