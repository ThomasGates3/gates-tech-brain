/**
 * POST /api/oauth/token — authorization_code (PKCE S256) and refresh_token
 * grants (public; form-encoded per OAuth). Issues lib/oauth access tokens that
 * /api/mcp accepts next to API keys.
 */
import { clientSecretOk, issueTokens, resolveClient, readRefresh, redeemCode } from "@/lib/oauth";

const noStore = { "Cache-Control": "no-store", Pragma: "no-cache" };
const oauthError = (error: string, status = 400) => Response.json({ error }, { status, headers: noStore });

async function readForm(req: Request): Promise<URLSearchParams> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const j = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return new URLSearchParams(Object.entries(j).map(([k, v]) => [k, String(v)]));
  }
  return new URLSearchParams(await req.text());
}

/** client_id / client_secret from the form or HTTP Basic. */
function credentials(req: Request, form: URLSearchParams): { id: string | null; secret: string | null } {
  const basic = req.headers.get("authorization")?.match(/^Basic\s+(.+)$/i)?.[1];
  if (basic) {
    const [id, secret] = Buffer.from(basic, "base64").toString("utf8").split(":").map(decodeURIComponent);
    return { id: id ?? null, secret: secret ?? null };
  }
  return { id: form.get("client_id"), secret: form.get("client_secret") };
}

export async function POST(req: Request) {
  const form = await readForm(req);
  const { id: clientId, secret } = credentials(req, form);
  const client = await resolveClient(clientId);
  if (!clientId || !client || !clientSecretOk(clientId, client, secret)) return oauthError("invalid_client", 401);

  const grant = form.get("grant_type");
  if (grant === "authorization_code") {
    const operator = redeemCode(form.get("code") ?? "", clientId, form.get("redirect_uri") ?? "", form.get("code_verifier") ?? "");
    if (!operator) return oauthError("invalid_grant");
    return Response.json(issueTokens(operator, clientId), { headers: noStore });
  }
  if (grant === "refresh_token") {
    const operator = readRefresh(form.get("refresh_token") ?? "", clientId);
    if (!operator) return oauthError("invalid_grant");
    return Response.json(issueTokens(operator, clientId), { headers: noStore });
  }
  return oauthError("unsupported_grant_type");
}
