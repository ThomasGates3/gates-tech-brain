import type { Connector } from "@/lib/types";

export const github: Connector = {
  id: "github",
  label: "GitHub",
  auth: "bearer",
  baseUrl: "https://api.github.com",
  credential: { vaultKey: "GITHUB_TOKEN", scopes: ["repo", "read:org"] },
  rateLimit: { requests: 60, perSeconds: 60 },
  enabled: true,
  tools: [
    {
      name: "list_repos",
      description: "List repositories for an owner",
      method: "GET",
      path: "/users/{owner}/repos",
      risk: "read",
      params: {
        owner: { type: "string", required: true, in: "path" },
        per_page: { type: "number", in: "query", description: "Results per page (max 100)" },
      },
      resultPath: undefined,
    },
    {
      name: "get_repo",
      description: "Get details for a specific repository",
      method: "GET",
      path: "/repos/{owner}/{repo}",
      risk: "read",
      params: {
        owner: { type: "string", required: true, in: "path" },
        repo: { type: "string", required: true, in: "path" },
      },
    },
    {
      name: "list_issues",
      description: "List open issues for a repository",
      method: "GET",
      path: "/repos/{owner}/{repo}/issues",
      risk: "read",
      params: {
        owner: { type: "string", required: true, in: "path" },
        repo: { type: "string", required: true, in: "path" },
        state: { type: "string", in: "query", description: "open | closed | all" },
        per_page: { type: "number", in: "query" },
      },
    },
    {
      name: "create_issue",
      description: "Create a new GitHub issue",
      method: "POST",
      path: "/repos/{owner}/{repo}/issues",
      risk: "write",
      params: {
        owner: { type: "string", required: true, in: "path" },
        repo: { type: "string", required: true, in: "path" },
        title: { type: "string", required: true, in: "body" },
        body: { type: "string", in: "body" },
        labels: { type: "array", in: "body" },
      },
    },
    {
      name: "list_workflows",
      description: "List GitHub Actions workflows for a repository",
      method: "GET",
      path: "/repos/{owner}/{repo}/actions/workflows",
      risk: "read",
      params: {
        owner: { type: "string", required: true, in: "path" },
        repo: { type: "string", required: true, in: "path" },
      },
      resultPath: "workflows",
    },
    {
      name: "trigger_workflow",
      description: "Manually trigger a GitHub Actions workflow",
      method: "POST",
      path: "/repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches",
      risk: "write",
      params: {
        owner: { type: "string", required: true, in: "path" },
        repo: { type: "string", required: true, in: "path" },
        workflow_id: { type: "string", required: true, in: "path" },
        ref: { type: "string", required: true, in: "body", description: "Branch or tag to run workflow on" },
        inputs: { type: "object", in: "body", description: "Workflow inputs" },
      },
    },
  ],
};
