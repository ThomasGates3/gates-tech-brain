/**
 * MCP server for Ace and the Gates Grok bots — https://brain.gatestech.solutions/api/mcp
 * Auth: Authorization: Bearer <API key> (create one in Operations → Access), or
 * OAuth sign-in (lib/oauth) for Claude's custom connectors on web + phone.
 * Unauthenticated calls get a 401 + WWW-Authenticate pointing at the metadata.
 * Same tools as /api/v1 (lib/brain/tools); the locked Field path is enforced underneath.
 */
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { TOOLS, callTool } from "@/lib/brain/tools";
import { operatorForApiKey } from "@/lib/api-keys";
import { isOAuthAccessToken, readAccessToken, SCOPE } from "@/lib/oauth";
import type { Operator } from "@/lib/field/types";

export const maxDuration = 120;

const handler = createMcpHandler(
  (server) => {
    for (const t of TOOLS) {
      server.registerTool(t.name, { title: t.title, description: t.description, inputSchema: t.input }, async (args, ctx) => {
        const operator = (ctx.http?.authInfo?.extra?.operator as Operator | undefined) ?? "ace";
        const r = await callTool(t.name, args, { operator, via: "mcp" });
        return r.ok
          ? { content: [{ type: "text" as const, text: JSON.stringify(r.result, null, 2) }] }
          : { isError: true, content: [{ type: "text" as const, text: `Error ${r.status}: ${r.error}` }] };
      });
    }
  },
  { serverInfo: { name: "gates-tech-brain", version: "1.0.0" } }
);

const authed = withMcpAuth(
  handler,
  async (_req, token) => {
    if (isOAuthAccessToken(token)) {
      const t = readAccessToken(token);
      return t ? { token: token!, clientId: t.clientId, scopes: [SCOPE], expiresAt: t.expiresAt, extra: { operator: t.operator } } : undefined;
    }
    const operator = await operatorForApiKey(token);
    return operator ? { token: token!, clientId: operator, scopes: [], extra: { operator } } : undefined;
  },
  { required: true }
);

export { authed as GET, authed as POST, authed as DELETE };
