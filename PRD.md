# PRD — AI BRAIN 🧠

> **The Nervous System for a Business.** A hybrid platform that thinks, researches, connects to anything, and acts autonomously — controlled from a beautiful space-themed command deck. Built to be sold as a $15K product across 5 industry verticals.

**Model strategy (build):** Opus (this doc + orchestration logic) → Haiku (feature build via Task agents) → Sonnet (fallback for complex logic).

**Model strategy (runtime — CONFIGURABLE):** The Conductor + specialist models are a config value (`MODEL_TIER` env), never hardcoded. Two tiers ship:
- `standard` → **Sonnet** Conductor + Haiku for cheap sub-tasks. Used for OUR internal version (lower run cost).
- `flagship` → **Opus** Conductor. Premium tier for SOLD systems.
Set per deployment; routed through Vercel AI Gateway as `"anthropic/claude-sonnet-4-6"` vs `"anthropic/claude-opus-4-8"`. `verticals/{name}.ts` may override tier per client.
**Status:** Planning. Build phase splits across 4 parallel agents (UI · API/Logic · Security · UX).

---

## 1. Problem

Businesses drown in fragmented tools and manual work:
- ❌ Data scattered across CRMs, databases, analytics, repos, and cloud consoles — no single brain sees it all
- ❌ Every "AI assistant" is a shallow chatbot that can't *act* — it can't hit an API, run a report, or ship a change
- ❌ Research (market, competitor, technical) is slow, manual, and never reused
- ❌ No memory: assistants forget context between tasks and can't run autonomously overnight
- ❌ Custom automation costs $50K+ and 3 months of dev time per business

**Cost of inaction:** teams pay analysts and ops people to do what a well-connected agent could do in seconds — and still miss insights buried across systems.

## 2. Solution

**AI Brain** is a single intelligence layer that connects to a business's entire stack and executes real work:

- ✅ **Universal connectors** — Databases/Analytics (Supabase, BigQuery, webhooks) + DevOps (GitHub, Vercel, AWS). Add any REST/GraphQL API via a config-driven connector spec.
- ✅ **Multi-agent orchestration** — an Opus "Conductor" routes tasks to specialist sub-agents (Research, Data, DevOps, Comms, Reporting)
- ✅ **Research engine** — NotebookLM integration turns URLs/docs/YouTube into briefings, podcasts, and structured knowledge the brain remembers
- ✅ **Autonomous mode** — scheduled + event-triggered jobs run in the background and report results
- ✅ **Space command deck** — a stunning dashboard to watch the brain think, approve actions, and inspect every tool call
- ✅ **Sellable** — one codebase, 5 vertical "personalities" (defined by the YouTube source — see §9)

### How It Works
1. **Connect** — link the business's APIs/data via encrypted connectors (OAuth or key-in-vault)
2. **Ingest** — feed sources into the knowledge layer (NotebookLM + vector memory)
3. **Ask or Automate** — a human asks in the deck, or a trigger fires a job
4. **Orchestrate** — Conductor plans → delegates to specialist agents → each runs real tool calls
5. **Approve & Act** — risky actions pause for human approval; safe ones execute
6. **Report** — results stream to the deck + optional Slack/email/report artifact

---

## 3. Architecture

```
                       ┌─────────────────────────────────────┐
                       │      SPACE COMMAND DECK (Next.js)     │
                       │  Live agent feed · Tool-call inspector│
                       │  Approvals · Connectors · Knowledge   │
                       └───────────────┬─────────────────────┘
                                       │  (WebSocket / SSE stream)
                       ┌───────────────▼─────────────────────┐
                       │        ORCHESTRATOR (Conductor)       │
                       │  Opus · plans, routes, holds memory   │
                       └───┬───────┬───────┬───────┬──────────┘
             ┌─────────────┘       │       │       └─────────────┐
     ┌───────▼──────┐  ┌───────────▼──┐ ┌──▼──────────┐ ┌────────▼───────┐
     │  RESEARCH    │  │    DATA      │ │   DEVOPS     │ │   COMMS/REPORT  │
     │ NotebookLM,  │  │ Supabase,    │ │ GitHub,      │ │ Slack, Email,   │
     │ web search   │  │ BigQuery,    │ │ Vercel, AWS  │ │ report artifacts│
     │              │  │ webhooks     │ │              │ │                 │
     └──────────────┘  └──────────────┘ └──────────────┘ └─────────────────┘
                                       │
                       ┌───────────────▼─────────────────────┐
                       │   CORE SERVICES                       │
                       │  Connector Registry · Tool Router ·   │
                       │  Memory (vector+kv) · Job Scheduler · │
                       │  Secrets Vault · Audit Log · Approvals│
                       └──────────────────────────────────────┘
```

### Components
- **Command Deck (UI)** — Next.js App Router + Tailwind + shadcn. Space aesthetic (per DESIGN.md). Real-time stream of the brain's reasoning and every tool call.
- **Orchestrator** — Vercel AI SDK agent loop. Opus plans and delegates; maintains conversation + long-term memory. Tool calls go through the Tool Router.
- **Specialist Agents** — scoped tool subsets (Research / Data / DevOps / Comms). Each is a sub-agent the Conductor can invoke.
- **Connector Registry** — declarative connector specs (`connectors/*.ts`): auth type, base URL, endpoints, rate limits. New API = new spec, no core changes. **This is the "hackable" core.**
- **Tool Router** — maps agent intent → connector call. Enforces per-tool permissions + approval gates.
- **Memory** — Neon pgvector (embeddings of knowledge/sources) + KV table (facts, task state). NotebookLM artifacts land here.
- **Jarvis Experience Layer** — see §3.5. The personality + presence that makes the brain feel alive.
- **Job Scheduler** — cron + webhook triggers for autonomous mode.
- **Secrets Vault** — never in code. Local: `.env.local`. Prod: Vercel env / AWS Secrets Manager (per CLAUDE.md security rules).
- **Audit Log** — every tool call, approval, and secret access recorded.

### 3.5 The Jarvis Experience Layer 🎙️
The brain shouldn't feel like a dashboard — it should feel like a *presence* that happens to run your business. This is a core pillar, owned jointly by the UI + UX agents.

- **Voice, both ways** — speak to it (Web Speech API / Whisper) and it speaks back (streamed TTS, e.g. ElevenLabs). Ambient wake phrase optional.
- **A personality with continuity** — a consistent voice/tone that remembers you, greets you with a situational briefing ("Good evening. Signups are up 12%, one deploy failed, and I drafted the client report."), and has dry competence like Jarvis.
- **Living presence** — a reactive core orb/HUD that pulses while thinking, ripples on tool calls, and shifts color by system state. Motion is meaningful, never decorative.
- **Proactive, not passive** — surfaces things you didn't ask for ("You'll want to see this before your 3pm"). Autonomous jobs report back conversationally.
- **Cinematic but legible** — HUD overlays, telemetry readouts, and glass panels sit *around* real, dense, useful data. Beauty never costs clarity.
- **Per-vertical persona** — each of the 5 verticals gets its own name, voice, and briefing style (from the YouTube source).

**AC:** a user can hold a spoken conversation that triggers real tool calls; the brain proactively surfaces at least one unprompted insight on login; the core HUD reacts in real time to agent activity.

### Tech Stack
- **Frontend/Backend:** Next.js (App Router), TypeScript, Tailwind, shadcn/ui
- **AI:** Vercel AI SDK v6 + AI Gateway. Conductor model set by `MODEL_TIER` (`standard`=Sonnet / `flagship`=Opus); Haiku for cheap sub-tasks
- **Data:** Neon.tech (serverless Postgres + pgvector), `@neondatabase/serverless` driver — pairs with Vercel Fluid Compute. Auth via Auth.js (NextAuth) with Neon adapter.
- **Research:** `notebooklm-py` CLI wrapped as a tool
- **Deploy:** Vercel (Fluid Compute), auto-deploy on push
- **Testing:** Playwright (E2E), per phase-based strategy

---

## 4. Build Split (Parallel Agents)

| Agent | Owns | Key deliverables |
|-------|------|------------------|
| **UI Agent** | Command Deck + HUD | Layout, reactive core orb/HUD, live agent-feed, tool-call inspector, connector manager, knowledge panel, approvals modal. All with `data-testid`. Space/Jarvis theme per DESIGN.md. |
| **API/Logic Agent** | Orchestrator + connectors | AI SDK agent loop, Conductor→specialist delegation, Connector Registry + 6 connectors (Supabase, BigQuery, webhook, GitHub, Vercel, AWS), NotebookLM tool, Tool Router, scheduler. |
| **Security Agent** | Trust layer | Secrets Vault, auth (Supabase), per-tool permissions, approval gates, audit log, input validation (zod), rate limiting, CORS, `npm audit`. |
| **UX Agent** | Flow + feel + voice | Jarvis experience layer (voice in/out, personality, situational briefings, proactive insights), onboarding (<5 min), approval UX, streaming reasoning, empty/loading/error states, mobile, a11y (44px). |

Shared contracts (defined first, in `/lib/types.ts`) so agents don't collide:
- `Connector`, `ToolCall`, `ToolResult`, `AgentEvent`, `ApprovalRequest`, `Job`, `AuditEntry`.

---

## 5. Features & Acceptance Criteria

### F1 — Space Command Deck
- Live-streaming feed of Conductor reasoning + sub-agent activity
- Tool-call inspector: request, response, latency, cost per call
- Connector manager: add/test/disable connectors from UI
- **AC:** deck renders live agent events via SSE; inspector shows every tool call with status.

### F2 — Orchestrator + Specialist Agents
- Opus Conductor plans a task, delegates to the right specialist, returns synthesized result
- **AC:** a request touching 2+ systems (e.g. "compare last week's signups in Supabase to our Vercel deploy frequency") routes to Data + DevOps agents and returns a combined answer.

### F3 — Connector Registry (the hackable core)
- Declarative spec adds any REST/GraphQL API without touching orchestrator code
- Ships with: Supabase, BigQuery, generic Webhook, GitHub, Vercel, AWS
- **AC:** adding a new connector spec makes its tools available to agents after restart; bad specs fail validation with clear errors.

### F4 — Research Engine (NotebookLM)
- Create notebook, add sources (URL/YouTube/PDF), generate briefing, pull answers into memory
- **AC:** "research X" produces a stored briefing the brain cites in later answers.

### F5 — Autonomous Mode
- Cron + webhook triggered jobs; results reported to deck + optional Slack/email
- **AC:** a scheduled job runs without a human present and logs a report.

### F6 — Trust Layer (Security)
- Secrets in vault only; approval gates on write/destructive tools; full audit log
- **AC:** destructive tool call pauses for approval; secrets never appear in logs or client bundle; audit log records every action.

### F7 — Onboarding & UX
- Connect first API + run first task in under 5 minutes
- **AC:** new user reaches a successful first tool call guided by onboarding.

---

## 6. Security (per CLAUDE.md — mandatory)
- No hardcoded keys; `.env.local` local, secret manager in prod; vault-fetched at startup
- Every connector credential encrypted at rest; minimal-scope service accounts
- zod validation on all inputs; parameterized DB queries; DOMPurify on rendered content
- Approval gates + audit logging on all state-changing tool calls
- Rate limiting on API routes; CORS whitelisted in prod; HTTPS/HSTS
- `npm audit` before every commit; secrets in `.gitignore`

## 7. Phases
- **Phase 1 (MVP):** Deck + Conductor + Data & DevOps connectors + NotebookLM + manual approvals. Manual testing.
- **Phase 2 (Hardening):** Autonomous jobs, full security layer, Playwright E2E across critical flows, vertical personalities.

## 8. Success Metrics
- Connect a new API in < 5 min · First useful multi-system answer in < 60s · Autonomous job runs unattended · Zero secrets in bundle/logs · Deck streams every tool call.

## 9. The 5 Vertical Personalities  ✅ (from YouTube source)

**Source:** *"How To Sell An AI Second Brain OS (Claude Code + Obsidian)"* — NotebookLM notebook `0940f9ea…`.

**Core positioning (applies to all 5):** The buyer is an **overwhelmed service-business owner**, ~$500K–$5M revenue, 5–30 employees, where *"knowledge and process ARE the product."* Their pain: *"everything important lives in the owner's head,"* *"knowledge lives in six people's heads,"* and when a star employee quits *"client knowledge walks out the door with them."* Their stack is *"scattered across five places"* (Google Workspace, Slack, WhatsApp, CRM, spreadsheets). **The Brain is the operating system for the founder's mind and business** — it reads all their info, organizes it, writes to it, and acts across it. **ROI frame:** *"one reclaimed hour a week pays the retainer several times over."* Sold as a **done-for-you install** (get the business out of your head; onboarding new hires takes *"days not months"*; *"retain the employee's brain even if you can't retain the employee"*).

The product ships as ONE codebase; each vertical = a preset (`verticals/{name}.ts`): persona name + voice, system prompt, default connectors, key jobs, deck accent theme.

| # | Vertical | Persona hook | Default connectors (beyond core) | Signature jobs |
|---|----------|-------------|----------------------------------|----------------|
| 1 | **Marketing & Creative Agencies** | "Agency brain" — stops knowledge siloing across editors/designers/AMs | CRM (HubSpot), project mgmt (Asana/Notion), analytics, Slack | Onboard new hire from SOPs; recover a departed AM's client knowledge; auto client status reports |
| 2 | **Accounting & Bookkeeping Firms** | Finds where "money is leaking" from scattered info | QuickBooks/Xero, spreadsheets, bank/webhook feeds | Consolidate financial data; surface cost/revenue leaks; SOP-driven close checklist |
| 3 | **Law Firms** | Gets what's "in the owner's head" into plain-text files it acts on | Doc store (Obsidian/Notion/Drive), matter mgmt, calendar | Matter knowledge base; pitch/intake assist; reduce "bad-area decision" risk |
| 4 | **Dental & Medical Practices** | "System answers, not just you" — retain the team's brain | Practice mgmt/EHR (scoped, PHI-safe), scheduling, SOP store | Fast staff onboarding; SOP retrieval; process retention when staff leave |
| 5 | **Insurance Brokerages** | Kills "internal waste" on thin, spiky margins | CRM/AMS, policy docs, email, webhooks | Reclaim wasted hours; policy/renewal knowledge; ROI reporting |

*Tertiary fits mentioned (future presets): Roofing companies, Multi-location franchise operators (Subway/7-Eleven).*

**Cross-vertical constant:** every persona greets the owner with a **situational briefing** (Jarvis §3.5) and proves the ROI frame by surfacing reclaimed-time wins. **F8 build:** derive `verticals/{name}.ts` from this table; a `VERTICAL` env/setting selects the active persona at deploy time.

---
*Ralph tracking: see `progress.txt`. Docs finalized in `README.md` at project end.*
