import type { Connector } from "@/lib/types";

export const bigquery: Connector = {
  id: "bigquery",
  label: "BigQuery",
  auth: "bearer",
  baseUrl: "https://bigquery.googleapis.com/bigquery/v2",
  credential: { vaultKey: "BIGQUERY_ACCESS_TOKEN" },
  rateLimit: { requests: 10, perSeconds: 1 },
  enabled: true,
  tools: [
    {
      name: "run_query",
      description: "Execute a BigQuery SQL query and return results",
      method: "POST",
      path: "/projects/{projectId}/queries",
      risk: "read",
      params: {
        projectId: { type: "string", required: true, in: "path" },
        query: { type: "string", required: true, in: "body", description: "SQL query" },
        maxResults: { type: "number", in: "body", description: "Max rows to return" },
        useLegacySql: { type: "boolean", in: "body", description: "Use legacy SQL dialect (default false)" },
      },
      resultPath: "rows",
    },
    {
      name: "list_datasets",
      description: "List all datasets in a BigQuery project",
      method: "GET",
      path: "/projects/{projectId}/datasets",
      risk: "read",
      params: {
        projectId: { type: "string", required: true, in: "path" },
      },
      resultPath: "datasets",
    },
  ],
};
