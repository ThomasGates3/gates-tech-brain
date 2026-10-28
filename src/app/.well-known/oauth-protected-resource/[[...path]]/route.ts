/**
 * RFC 9728 protected-resource metadata for /api/mcp (served at the root and at
 * /.well-known/oauth-protected-resource/api/mcp). Points clients at our own
 * authorization server (lib/oauth).
 */
import { getPublicOrigin, metadataCorsOptionsRequestHandler } from "mcp-handler";
import { SCOPE } from "@/lib/oauth";

export function GET(req: Request) {
  const origin = getPublicOrigin(req);
  const body = { resource: `${origin}/api/mcp`, authorization_servers: [origin], scopes_supported: [SCOPE], bearer_methods_supported: ["header"] };
  return Response.json(body, { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "max-age=3600" } });
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
