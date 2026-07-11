/**
 * Connector Registry — loads declarative specs and exposes them as validated entries.
 * New connector = new spec file + import here. No orchestrator changes needed.
 */
import type { Connector, ConnectorStatus } from "@/lib/types";
import { supabase } from "./specs/supabase";
import { bigquery } from "./specs/bigquery";
import { webhook } from "./specs/webhook";
import { github } from "./specs/github";
import { vercel } from "./specs/vercel";
import { aws } from "./specs/aws";
import { APP_CONNECTORS } from "./specs/apps";

const ALL_CONNECTORS: Connector[] = [supabase, bigquery, webhook, github, vercel, aws, ...APP_CONNECTORS];

function validate(c: Connector): string[] {
  const errs: string[] = [];
  if (!c.id) errs.push("missing id");
  if (!c.baseUrl) errs.push(`${c.id}: missing baseUrl`);
  if (!c.tools.length) errs.push(`${c.id}: no tools defined`);
  c.tools.forEach((t) => {
    if (!t.name) errs.push(`${c.id}: tool missing name`);
    if (!t.path) errs.push(`${c.id}.${t.name}: missing path`);
  });
  return errs;
}

// Validate all specs on module load — throws in dev, warns in prod.
const validationErrors = ALL_CONNECTORS.flatMap(validate);
if (validationErrors.length) {
  const msg = `Connector Registry validation failed:\n${validationErrors.join("\n")}`;
  if (process.env.NODE_ENV === "development") throw new Error(msg);
  else console.error(msg);
}

export const registry = {
  /** All connectors (including disabled). */
  all(): Connector[] {
    return ALL_CONNECTORS;
  },
  /** Only enabled connectors. */
  enabled(): Connector[] {
    return ALL_CONNECTORS.filter((c) => c.enabled);
  },
  get(id: string): Connector | undefined {
    return ALL_CONNECTORS.find((c) => c.id === id);
  },
  /** Ping a connector's baseUrl and return live health. */
  async test(id: string): Promise<ConnectorStatus> {
    const connector = this.get(id);
    const now = new Date().toISOString();
    if (!connector) {
      return { connectorId: id, reachable: false, lastCheckedAt: now, message: "Connector not found" };
    }
    try {
      const res = await fetch(connector.baseUrl, { method: "HEAD", signal: AbortSignal.timeout(5000) });
      return { connectorId: id, reachable: res.ok || res.status < 500, lastCheckedAt: now };
    } catch (e) {
      return {
        connectorId: id,
        reachable: false,
        lastCheckedAt: now,
        message: e instanceof Error ? e.message : "Unknown error",
      };
    }
  },
};
