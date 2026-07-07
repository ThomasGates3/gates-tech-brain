import type { Connector } from "@/lib/types";

export const supabase: Connector = {
  id: "supabase",
  label: "Supabase",
  auth: "api_key",
  baseUrl: process.env.SUPABASE_URL ?? "https://project.supabase.co",
  credential: { vaultKey: "SUPABASE_SERVICE_ROLE_KEY" },
  rateLimit: { requests: 100, perSeconds: 60 },
  enabled: true,
  tools: [
    {
      name: "query_table",
      description: "Run a PostgREST query against a Supabase table",
      method: "GET",
      path: "/rest/v1/{table}",
      risk: "read",
      params: {
        table: { type: "string", required: true, in: "path", description: "Table name" },
        select: { type: "string", in: "query", description: "Columns to select (PostgREST syntax)" },
        filter: { type: "string", in: "query", description: "Filter expression" },
        limit: { type: "number", in: "query", description: "Max rows" },
      },
    },
    {
      name: "insert_row",
      description: "Insert a row into a Supabase table",
      method: "POST",
      path: "/rest/v1/{table}",
      risk: "write",
      params: {
        table: { type: "string", required: true, in: "path" },
        row: { type: "object", required: true, in: "body", description: "Row data" },
      },
    },
    {
      name: "delete_row",
      description: "Delete rows matching a filter from a Supabase table",
      method: "DELETE",
      path: "/rest/v1/{table}",
      risk: "destructive",
      params: {
        table: { type: "string", required: true, in: "path" },
        filter: { type: "string", required: true, in: "query", description: "PostgREST filter (e.g. id=eq.123)" },
      },
    },
  ],
};
