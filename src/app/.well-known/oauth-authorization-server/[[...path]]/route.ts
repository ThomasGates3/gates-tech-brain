/** RFC 8414 authorization-server metadata (lib/oauth). */
import { getPublicOrigin, metadataCorsOptionsRequestHandler } from "mcp-handler";
import { authServerMetadata } from "@/lib/oauth";

export function GET(req: Request) {
  return Response.json(authServerMetadata(getPublicOrigin(req)), { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "max-age=3600" } });
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
