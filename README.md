# Gates Tech Brain

Gates Technologies only. Three surfaces in one Next.js app:

- **`/`**: the command deck, with real Field numbers, Operations (Connections · Agents · Access) and draft-only automations.
- **`/field`**: the **Field Console**, where Thomas + Ace run Email 1 cold outreach (see `docs/field-console-PRD.md`).
- **`/api/mcp`** + **`/api/v1`**: the MCP server and REST API that Ace and the Gates Grok bots call.

Locked Field path: Ace queue → Darrell Email 1 → Nick PASS/REVISE/KILL → Thomas Approve → AgentMail (hello@gatesoutreach.com). Soft = Hold. No prices in cold copy. No autopilot.

## MCP + API for Ace and the Grok bots

- **MCP URL:** `https://brain.gatestech.solutions/api/mcp` (Streamable HTTP).
- **OpenAPI:** `https://brain.gatestech.solutions/api/v1/openapi.json`; REST mirror at `POST /api/v1/tools/<tool name>`.
- **Auth:** `Authorization: Bearer <key>`. Create a key in the deck under **Operations → Access** (Thomas signed in). It is shown once; only its hash is stored. `FIELD_ACE_API_KEY` also works.
- **Grok:** grok.com/connectors → New Connector → Custom → paste the MCP URL → add the Authorization header.
- Pass `agent` (roster id, e.g. `"darrell"`) on each call. Every call writes an Activity row, and that bot shows **active** on the roster for 30 minutes.

| Tool | What it does |
| --- | --- |
| `brain_today` | Whole picture in one call: queue by stage, sends vs cap, Claude spend vs budget, gates, next actions. Start here. |
| `brain_field_queue` | Today's High+Med contacts (Soft excluded); `load_from_notion: true` pulls the morning pack first. |
| `brain_get_draft` / `brain_set_draft` | Read / write Email 1. `generate`: `template` (free), `sonnet` (default), `opus` (hard drafts only). Returns copy-lint issues. Any edit clears PASS. |
| `brain_set_nick_status` | PASS / REVISE / KILL + note. PASS refused if the copy lint fails. |
| `brain_hold` | Hold or release a contact. |
| `brain_approve_send` | Approve + send one Email 1 via AgentMail, returns `send_id`. Needs Nick PASS on the exact draft. Thomas-only (Ace key only with `FIELD_ACE_CAN_SEND=true`). |
| `brain_suppress` / `brain_send_log` | Opt-outs and the send log. |
| `brain_chat` | Run a prompt on Claude instead of Grok tokens. `sonnet` default, `haiku` cheapest, `opus` hard copy. Copy agents get the outreach brief; Hermes gets web search. |
| `brain_list_automations` / `brain_run_automation` | Draft-only Gates automations. `dry_run` defaults to true (nothing delivered); `false` posts the draft to deck/Discord. Never sends outreach. |
| `brain_get_brief` | The outreach brief + Email 1 rules. |
| `brain_list_agents` / `brain_report_activity` / `brain_activity` | Roster with real status, log finished work, recent activity. |

All Claude use (chat, drafts, automations, bots) shares one daily budget: warn at $3, hard stop at $5.50 (`CLAUDE_DAILY_WARN_USD` / `CLAUDE_DAILY_CAP_USD`), with alerts on the deck, in Field, and in Discord.

## Field Console

Morning pack → draft → Nick PASS → Thomas Approve → AgentMail send → log + suppress. One contact at a time; no autopilot.

| Step | Who | Gate (enforced server-side) |
| --- | --- | --- |
| Load pack | Ace / Thomas | Notion "Cold emails (paste)" rows dated today (or a pasted CSV). Soft → Hold-only, never sendable. |
| Draft Email 1 | Ace / Thomas | Template or "Draft with Claude", both built on `docs/outreach-brief.md`. Copy lint blocks prices, stats, client claims, HIPAA claims, "week"/"weak", em dashes, hype, >110 words. Address + opt-out are appended at send. |
| Nick audit | recorded by Ace / Thomas | PASS / REVISE / KILL + note. Any edit after PASS clears it. |
| Approve | **Thomas** (Ace too with `FIELD_ACE_CAN_SEND=true`) | Needs Nick PASS on the exact current draft, clean price lint, unsuppressed recipient. |
| Send | **Thomas** (Ace too with `FIELD_ACE_CAN_SEND=true`) | Explicit confirm; draft must equal the approved draft; CAN-SPAM address set; daily cap; atomic claim prevents double sends. |
| Log | automatic | `field_send_log` (sent_at, recipient, AgentMail id, operator) + `field_suppressions`; Notion row → Sent. |

**Setup**

1. Fill the Field Console block in `.env.example` → `.env.local` / Vercel env: `FIELD_THOMAS_PASSWORD`, `FIELD_ACE_PASSWORD`, `NOTION_TOKEN`, `AGENTMAIL_API_KEY`, `AGENTMAIL_INBOX_ID`, `FIELD_MAILING_ADDRESS`, plus `DATABASE_URL` and `AUTH_SECRET`.
2. Share the Notion "Cold emails (paste)" database with your Notion integration.
3. `npm run db:push` to create `field_contacts`, `field_send_log`, `field_suppressions`.
4. Sign in at `/sign-in` with your own password; Thomas/Ace land on `/field`.

**Ace (bot) API.** Ace is an agent, not a person. Set `FIELD_ACE_API_KEY` and give Ace that key. It calls the Field API with `Authorization: Bearer <key>` (the key only opens `/api/field/*`, nothing else on the deck):

| Call | Purpose |
| --- | --- |
| `GET /api/field/brief` | The outreach brief Ace must write inside, plus the Email 1 rules. Read it before drafting. |
| `GET /api/field/queue?date=YYYY-MM-DD` | Today's pack, every contact's stage/draft/`draftHash`, plus console config (`canGreenlight`, caps, gates). |
| `POST /api/field/queue` `{ "source": "notion", "date" }` | Load the morning pack from Notion. |
| `POST /api/field/contacts/:id` `{ "action": "generate", "mode": "template" \| "claude" }` | Draft Email 1 from the playbook. |
| `POST /api/field/contacts/:id` `{ "action": "save_draft", "subject", "body" }` | Write or rewrite the copy (clears any PASS/approval). |
| `POST /api/field/contacts/:id` `{ "action": "nick_verdict", "verdict": "PASS" \| "REVISE" \| "KILL", "note" }` | Record Nick's audit. |
| `POST /api/field/contacts/:id` `{ "action": "approve" }` / `hold` / `release` | Greenlight (needs `FIELD_ACE_CAN_SEND=true`) or park a contact. |
| `POST /api/field/contacts/:id/send` `{ "confirm": true, "draftHash" }` | Send one Email 1 (needs `FIELD_ACE_CAN_SEND=true`). |
| `GET /api/field/log` · `POST /api/field/log` `{ "email", "reason": "opt_out" }` | Send log + suppressions; suppress "no" replies. |
| `POST /api/field/claude` `{ "prompt", "system"?, "model"?: "light" \| "standard" \| "copy", "maxTokens"? }` | **Use Claude instead of Grok tokens** for heavy work (summaries, rewrites, research reads). `light` = Haiku 4.5 (default, cheapest), `standard` = Sonnet 5.5, `copy` = Opus 5.5. Text in, text out. Shares the Brain-wide daily Claude budget (warn $3, hard stop $5.50); returns 429 when the cap is hit. |
| `GET /api/field/claude` | Today's Claude spend vs the warn line and hard cap. |

Every gate (price lint, PASS on the exact draft, suppression, daily cap, CAN-SPAM, one send per contact) still applies to Ace. Errors come back as `{ ok: false, error }` with a status code Ace can act on.

**Outside-app blockers (tracked in the status bar, never faked):** cold-domain warm-up (`FIELD_DOMAIN_WARMED`), CAN-SPAM physical address (`FIELD_MAILING_ADDRESS`, sends are blocked without it).

Update the brief in `~/dev/gates-outreach/OUTREACH-BRIEF.md`, then `npm run brief:sync` to pull it in.

`npm test` runs the workflow/lint/playbook/CSV tests.

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
