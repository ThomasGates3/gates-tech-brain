import type { Connector } from "@/lib/types";

export const vercel: Connector = {
  id: "vercel",
  label: "Vercel",
  auth: "bearer",
  baseUrl: "https://api.vercel.com",
  credential: { vaultKey: "VERCEL_API_TOKEN" },
  rateLimit: { requests: 60, perSeconds: 60 },
  enabled: true,
  tools: [
    {
      name: "list_deployments",
      description: "List recent Vercel deployments for a project",
      method: "GET",
      path: "/v6/deployments",
      risk: "read",
      params: {
        projectId: { type: "string", in: "query", description: "Filter by project ID" },
        limit: { type: "number", in: "query", description: "Max deployments to return" },
        teamId: { type: "string", in: "query", description: "Team ID (if applicable)" },
      },
      resultPath: "deployments",
    },
    {
      name: "get_deployment",
      description: "Get details for a specific Vercel deployment",
      method: "GET",
      path: "/v13/deployments/{deploymentId}",
      risk: "read",
      params: {
        deploymentId: { type: "string", required: true, in: "path" },
      },
    },
    {
      name: "list_projects",
      description: "List all Vercel projects",
      method: "GET",
      path: "/v9/projects",
      risk: "read",
      params: {
        teamId: { type: "string", in: "query" },
        limit: { type: "number", in: "query" },
      },
      resultPath: "projects",
    },
    {
      name: "redeploy",
      description: "Trigger a redeployment of an existing Vercel deployment",
      method: "POST",
      path: "/v13/deployments/{deploymentId}/redeploy",
      risk: "write",
      params: {
        deploymentId: { type: "string", required: true, in: "path" },
        teamId: { type: "string", in: "query" },
      },
    },
  ],
};
