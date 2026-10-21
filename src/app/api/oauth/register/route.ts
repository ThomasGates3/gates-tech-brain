/**
 * POST /api/oauth/register — RFC 7591 dynamic client registration (public).
 * Stateless: the client_id is a signed record of the name + redirect URIs.
 * Only claude.ai / claude.com / loopback (or OAUTH_REDIRECT_HOSTS) redirects.
 */
import { z } from "zod";
import { allowedRedirect, registerClient, SCOPE } from "@/lib/oauth";

const Schema = z.object({
  redirect_uris: z.array(z.string().max(500)).min(1).max(10),
  client_name: z.string().max(100).optional(),
  token_endpoint_auth_method: z.enum(["none", "client_secret_post", "client_secret_basic"]).optional(),
});

const oauthError = (error: string, description: string) => Response.json({ error, error_description: description }, { status: 400 });

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return oauthError("invalid_client_metadata", "Body must be JSON");
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return oauthError("invalid_client_metadata", "redirect_uris is required");
  const { redirect_uris, client_name, token_endpoint_auth_method: auth = "none" } = parsed.data;
  const bad = redirect_uris.find((u) => !allowedRedirect(u));
  if (bad) return oauthError("invalid_redirect_uri", `Redirect not allowed: ${bad}`);

  const name = client_name?.trim() || "MCP client";
  const { clientId, clientSecret } = registerClient({ name, redirectUris: redirect_uris, auth });
  return Response.json(
    {
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: 0 } : {}),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: name,
      redirect_uris,
      token_endpoint_auth_method: auth,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: SCOPE,
    },
    { status: 201, headers: { "Cache-Control": "no-store" } }
  );
}
