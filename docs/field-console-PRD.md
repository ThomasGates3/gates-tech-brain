# PRD — Gates Field Console (internal ops)

**Date:** 2026-09-30  
**Author:** Spec  
**Assign:** Ace / Thomas  
**Build:** Claude Code (internal) — **not** Base44, **not** client portal  
**Path:** `/workspace/specs/field-console-2026-09-30/PRD.md`

Thomas-locked context (2026-09-30): cold email DIY via AgentMail (~$20) + secondary cold domain (trygates.tech / trygates.com purchase in flight). Explee is **not** the primary send path. Base44 stays client-portal only.

---

## Goal

Give Thomas and Ace a small internal ops console to run **Email 1** cold outreach without Claude-chat paste:

1. Load morning **High + Med** pack  
2. Draft Email 1 (Field playbook — human voice, **no prices**)  
3. Nick audit → **PASS** required  
4. Thomas **Approve** (greenlight)  
5. Send via **AgentMail** from the cold domain  
6. Log send + suppress  

Soft contacts stay **Hold**. Days 1 / 3 / 7 / 12 sequence is **later** — out of v1.

---

## Users

| User | Role |
| --- | --- |
| **Thomas** | Final greenlight / Approve → Send; owns domain + CAN-SPAM address |
| **Ace** | Ops: queue load, draft orchestration, Nick status chase, send log |

No external client users. No Field prospects log into this console.

---

## Non-goals

- Autopilot / unattended mass send  
- Prices, dollar amounts, or Gates SKUs in cold email copy  
- Spending **Base44 Builder credits** on this (Base44 = client portal only)  
- Explee as primary send path  
- Soft-tier send (Soft = Hold only)  
- Full Days 1/3/7/12 sequence UI in v1  
- Client-facing Base44 rebuild or gatestech.solutions work  
- Spec coding / deploying (Claude Code build path)

---

## Screens / flows

1. **Queue** — Today’s High + Med from Notion Cold emails DB (or CSV fallback). Show name, niche, score, status (New / Drafted / Nick / Approved / Sent / Hold / Kill). Soft filtered out or marked Hold-only.  
2. **Draft preview** — Email 1 subject + body per Field playbook. Editable. Tokens for prospect name / business. Explicit banner: no prices.  
3. **Nick status** — PASS / REVISE / KILL with note. Approve disabled until PASS.  
4. **Approve / Send** — Thomas-only control. One contact at a time (or small batch with explicit confirm). Calls AgentMail; never sends without Approve.  
5. **Log** (minimal) — sent_at, recipient, AgentMail id, suppress flag, operator.

Primary happy path: morning pack → draft → Nick PASS → Thomas Approve → AgentMail send → log.

---

## APIs / integrations

| Integration | Use |
| --- | --- |
| **Notion Cold emails DB** (or **CSV** fallback) | Morning High+Med pack source + status write-back |
| **AgentMail API** | Send from cold domain (~$20 DIY path) |
| **Optional Claude API** | Draft Email 1 generation (Field playbook prompt) |
| Cold domain | trygates.tech / trygates.com (purchase / warm outside app) |

No Explee primary. No Base44 Builder API for this console.

---

## Acceptance checks (“done when…”)

- [ ] Load today’s High + Med queue from Notion or CSV; Soft not sendable  
- [ ] Generate / show Email 1 draft (subject + body) with no prices in copy  
- [ ] Record Nick PASS / REVISE / KILL; Approve gated on PASS  
- [ ] After explicit Thomas Approve, send **one** email via AgentMail  
- [ ] Write send log + suppress record  
- [ ] UI never offers autopilot mass send  
- [ ] No Base44 Builder credits used for this build  

**Outside-app blockers (track, do not fake in UI):** domain warm-up; CAN-SPAM physical mailing address on cold domain sends.

---

## Risks

| Risk | Mitigation |
| --- | --- |
| Domain reputation | Warm trygates.* before volume; v1 = one-at-a-time send |
| CAN-SPAM physical address | Thomas supplies address; required in footer / AgentMail config before live send |
| Human-voice QC | Nick PASS mandatory before Approve |
| Price leak in copy | Playbook + draft lint / banner; Kennedy-style spot check on samples |
| Wrong product lane | Keep Field Console off Base44; do not burn Builder credits |

---

## Out of scope / later

- Soft nurture sequences  
- Days 1 / 3 / 7 / 12 multi-touch UI  
- Explee primary  
- Autopilot campaigns  
- Client portal features  

---

## Hand-off

- **PRD:** `/workspace/specs/field-console-2026-09-30/PRD.md`  
- Next: Ace → Claude Code build (Thomas); Spec does not code.  
- Rudy assets: **none** for this internal ops UI unless Ace asks later.
