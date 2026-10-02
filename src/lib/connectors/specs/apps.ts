/**
 * Gates business-app connectors: Gates Tech site (bookings/intake) and Speed to Lead.
 * Each app's base URL + agent token come from env (set per deployment). Auth is
 * a bearer "agent access token": add a matching token check to each app's API so
 * the Brain can call it. Endpoints below are mapped from each app's real routes.
 */
import type { Connector } from "@/lib/types";

const url = (key: string, fallback: string) => process.env[key] ?? fallback;

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

export const APP_CONNECTORS: Connector[] = [gatesTech, speedToLead];
