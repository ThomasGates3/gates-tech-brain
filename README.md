# Gates Tech Brain

Two surfaces in one Next.js app:

- **`/`**: the AI Brain command deck (see `PRD.md`).
- **`/field`**: the **Field Console**, an internal ops console for Thomas + Ace to run Email 1 cold outreach (see `docs/field-console-PRD.md`).

## Field Console

Morning pack → draft → Nick PASS → Thomas Approve → AgentMail send → log + suppress. One contact at a time; no autopilot.

| Step | Who | Gate (enforced server-side) |
| --- | --- | --- |
| Load pack | Ace / Thomas | Notion "Cold emails (paste)" rows dated today (or a pasted CSV). Soft → Hold-only, never sendable. |
| Draft Email 1 | Ace / Thomas | Field playbook template, or "Draft with Claude". Price lint banner: no $, fees, or Gates SKUs. |
| Nick audit | recorded by Ace / Thomas | PASS / REVISE / KILL + note. Any edit after PASS clears it. |
| Approve | **Thomas only** | Needs Nick PASS on the exact current draft, clean price lint, unsuppressed recipient. |
| Send | **Thomas only** | Explicit confirm; draft must equal the approved draft; CAN-SPAM address set; daily cap; atomic claim prevents double sends. |
| Log | automatic | `field_send_log` (sent_at, recipient, AgentMail id, operator) + `field_suppressions`; Notion row → Sent. |

**Setup**

1. Fill the Field Console block in `.env.example` → `.env.local` / Vercel env: `FIELD_THOMAS_PASSWORD`, `FIELD_ACE_PASSWORD`, `NOTION_TOKEN`, `AGENTMAIL_API_KEY`, `AGENTMAIL_INBOX_ID`, `FIELD_MAILING_ADDRESS`, plus `DATABASE_URL` and `AUTH_SECRET`.
2. Share the Notion "Cold emails (paste)" database with your Notion integration.
3. `npm run db:push` to create `field_contacts`, `field_send_log`, `field_suppressions`.
4. Sign in at `/sign-in` with your own password; Thomas/Ace land on `/field`.

**Outside-app blockers (tracked in the status bar, never faked):** cold-domain warm-up (`FIELD_DOMAIN_WARMED`), CAN-SPAM physical address (`FIELD_MAILING_ADDRESS`, sends are blocked without it).

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
