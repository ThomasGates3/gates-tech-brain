/**
 * Business-app connectors — the Brain's reach into your real /dev apps.
 * Each app's base URL + agent token come from env (set per deployment). Auth is
 * a bearer "agent access token": add a matching token check to each app's API so
 * the Brain can call it. Endpoints below are mapped from each app's real routes.
 */
import type { Connector } from "@/lib/types";

const url = (key: string, fallback: string) => process.env[key] ?? fallback;

// ── Twin Trading (content engine) ──────────────────────────────────────────
export const twinTrading: Connector = {
  id: "twin-trading",
  label: "Twin Trading (content engine)",
  auth: "bearer",
  baseUrl: url("TWIN_TRADING_URL", "http://localhost:3001"),
  credential: { vaultKey: "TWIN_TRADING_TOKEN" },
  enabled: true,
  tools: [
    { name: "list_ideas", description: "List content ideas", method: "GET", path: "/api/ideas", risk: "read" },
    { name: "create_idea", description: "Add a new content idea", method: "POST", path: "/api/ideas", risk: "write", params: { title: { type: "string", required: true, in: "body" }, notes: { type: "string", in: "body" } } },
    { name: "generate_image", description: "Generate an image from a prompt", method: "POST", path: "/api/generate-image", risk: "write", params: { prompt: { type: "string", required: true, in: "body" } } },
    { name: "generate_video", description: "Generate a video from a storyboard/prompt", method: "POST", path: "/api/generate-video", risk: "write", params: { prompt: { type: "string", required: true, in: "body" } } },
    { name: "list_videos", description: "List generated videos", method: "GET", path: "/api/videos", risk: "read" },
    { name: "stats", description: "Content pipeline stats", method: "GET", path: "/api/stats", risk: "read" },
  ],
};

// ── Twin Trading — Link in Bio (Express) ────────────────────────────────────
export const twinTradingBio: Connector = {
  id: "twin-trading-bio",
  label: "Twin Trading — Link in Bio",
  auth: "bearer",
  baseUrl: url("TWIN_TRADING_BIO_URL", "http://localhost:3002"),
  credential: { vaultKey: "TWIN_TRADING_BIO_TOKEN" },
  enabled: true,
  tools: [
    { name: "get_links", description: "Get the current link-in-bio links", method: "GET", path: "/api/links", risk: "read" },
    { name: "update_links", description: "Update the link-in-bio links", method: "POST", path: "/api/links", risk: "write", params: { links: { type: "array", required: true, in: "body" } } },
  ],
};

// ── Ad System (Veo + HeyGen video, leads) ───────────────────────────────────
export const adSystem: Connector = {
  id: "ad-system",
  label: "Ad System (video + leads)",
  auth: "bearer",
  baseUrl: url("AD_SYSTEM_URL", "http://localhost:3003"),
  credential: { vaultKey: "AD_SYSTEM_TOKEN" },
  enabled: true,
  tools: [
    { name: "generate_veo_video", description: "Generate a video with Veo", method: "POST", path: "/api/veo", risk: "write", params: { prompt: { type: "string", required: true, in: "body" } } },
    { name: "generate_heygen_video", description: "Generate an avatar/clone video with HeyGen", method: "POST", path: "/api/heygen/video", risk: "write", params: { script: { type: "string", required: true, in: "body" }, avatar: { type: "string", in: "body" } } },
    { name: "list_leads", description: "List captured leads", method: "GET", path: "/api/leads", risk: "read" },
    { name: "analytics", description: "Get analytics", method: "GET", path: "/api/analytics", risk: "read" },
    { name: "results", description: "Get generation results/status", method: "GET", path: "/api/results", risk: "read" },
  ],
};

// ── AI Link in Bio ──────────────────────────────────────────────────────────
export const aiLinkBio: Connector = {
  id: "ai-link-bio",
  label: "AI Link in Bio",
  auth: "bearer",
  baseUrl: url("AI_LINK_BIO_URL", "http://localhost:3004"),
  credential: { vaultKey: "AI_LINK_BIO_TOKEN" },
  enabled: true,
  tools: [
    { name: "checkout", description: "Create a checkout session", method: "POST", path: "/api/checkout", risk: "write", params: { plan: { type: "string", required: true, in: "body" } } },
  ],
};

// ── Gates Tech (GTV2 — agency site: bookings + intake) ───────────────────────
export const gatesTech: Connector = {
  id: "gates-tech",
  label: "Gates Tech (GTV2)",
  auth: "bearer",
  baseUrl: url("GATES_TECH_URL", "http://localhost:3005"),
  credential: { vaultKey: "GATES_TECH_TOKEN" },
  enabled: true,
  tools: [
    { name: "health", description: "Health check", method: "GET", path: "/api/health", risk: "read" },
    { name: "create_booking", description: "Create a booking", method: "POST", path: "/api/booking", risk: "write", params: { name: { type: "string", required: true, in: "body" }, email: { type: "string", required: true, in: "body" }, datetime: { type: "string", in: "body" } } },
    { name: "submit_intake", description: "Submit a client intake", method: "POST", path: "/api/intake", risk: "write", params: { name: { type: "string", required: true, in: "body" }, email: { type: "string", required: true, in: "body" }, details: { type: "string", in: "body" } } },
  ],
};

// ── Speed to Lead (lead outreach automation) ────────────────────────────────
export const speedToLead: Connector = {
  id: "speed-to-lead",
  label: "Speed to Lead",
  auth: "bearer",
  baseUrl: url("SPEED_TO_LEAD_URL", "http://localhost:3006"),
  credential: { vaultKey: "SPEED_TO_LEAD_TOKEN" },
  enabled: true,
  tools: [
    { name: "list_leads", description: "List leads (filter by status/search)", method: "GET", path: "/api/leads", risk: "read", params: { status: { type: "string", in: "query" }, search: { type: "string", in: "query" } } },
    { name: "generate_message", description: "Draft an outreach message for a lead", method: "POST", path: "/api/leads/generate-message", risk: "write", params: { leadId: { type: "string", required: true, in: "body" } } },
    { name: "send_outreach", description: "Send outreach to a lead (SMS/email)", method: "POST", path: "/api/leads/send-outreach", risk: "destructive", params: { leadId: { type: "string", required: true, in: "body" } } },
    { name: "settings", description: "Get outreach settings", method: "GET", path: "/api/settings", risk: "read" },
  ],
};

export const APP_CONNECTORS: Connector[] = [twinTrading, twinTradingBio, adSystem, aiLinkBio, gatesTech, speedToLead];
