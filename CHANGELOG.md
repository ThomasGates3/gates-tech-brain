# Changelog

## 2026-10-03: What's new + website closer
- 2026-10-03 · brain · What's new: This tab.
- 2026-10-02 · brain · What's new: Money roadmap. Nine steps from offer locked to first paid client, with live counts.
- 2026-10-02 · brain · What's new: Copy rules. Core emails must quote published hours or the lead is held. Website emails are three plain fixes with no links.
- Website Email 1 closer is locked to "We build sites with booking built in." Copy lint fails a website Email 1 without it, or with Gates anywhere in the body (the signature and mailing address may still say Gates Technologies).

## 2026-10-02: Money roadmap
- 2026-10-02 · brain · /roadmap landed: nine steps from ready to mail to first paid client, four live numbers, `brain_roadmap_get` / `brain_roadmap_set`, Booked call and Paid on emailed leads. Seeded done: offer, send_domain, copy_rules. Now: warmup.

## 2026-10-02: Field harden (Nick audit) + website master prompt

### Core lane: hours honesty
- The Email 1 opener must name a weekday and a published open or close time copied from the site or listing ("Wednesday 9 to 4 and Thursday 10 to 5"). A greeting line ("Rabah,") doesn't count as the opener.
- Banned vague hours talk: limited blocks, sparse Saturday, depending on when the desk closes, unclear who answers, after-close coverage depends.
- No checkable desk hours (gap note, scout notes, then the lead's own site) means no draft. The lead goes to Hold with reason `no_published_hours` and shows on /leads as "Hold: needs published hours". No invented "9pm on Sunday" scenarios.
- When Friday closes earlier, write "Monday to Thursday … and Friday …", never "Monday to Friday ends at X and Friday closes at Y".

### Website lane: plain speech
- Banned in Email 1: XHTML/HTML, classic-mobile, legacy table HTML, Webador, Wix, Squarespace, CMS, SEO, template stack, CSS, JavaScript. Say "old HomeAdvisor phone-site template", "outdated mobile template", "old table-layout contact page", "DIY builder site".
- Banned put-downs: SEO filler, generic filler, thin brand, unfinished for, junk site, looks cheap, amateur, ugly. Open with a checkable defect (exact typo in quotes, empty homepage, .mobi address, dated badges).
- Lint still fails without exactly three numbered fixes, or with any link or attachment cue.

### Scout to draft, same day
- `brain_upsert_lead` from Ashley or Prospectacle with a High or Med lead queues a Sonnet draft in that lane right after the response (`auto_draft: true` by default). Core runs the hours check first and may hold instead.
- Scout markdown files never count as drafted; only `brain_set_draft`, `brain_import_draft` or generate.
- Soft stays on Hold (`soft`); a merge never demotes High or Med to Soft.

### Nick pack hygiene
- A REVISE remembers the exact draft Nick reviewed. `brain_nick_queue` and submit skip it until the body changes.
- /leads shows Nick's note under REVISE rows, marked "not rewritten yet" or "rewritten".

### UX
- Hold rows carry a reason badge: soft, needs hours, Thomas, other.
- Scoreboard keeps: "Confirm warm-up = allow Field sends. Does not send mail by itself."

### Website build brief
- `docs/website-master-prompt.md` is the master website prompt (Premium Website Architect), stored verbatim. `npm run website:sync` regenerates `src/lib/website/master-prompt.ts` after edits.
- `brain_website_brief` returns that prompt plus the filled "Build a website for…" message for a lead, and lists the checklist questions still unanswered. It is for building the prospect's site, never for cold email copy.

### Example PASS: core Email 1
```
Subject: after buckhead closes

Rabah,

Your Buckhead page shows Tuesday through Thursday open 10am to 5pm, Saturday 10am to 2pm, and Monday and Friday closed.

So a call after 5 on a Tuesday, or any call on Monday, has nowhere to go. Most people won't leave a voicemail. They book with whoever picks up.

We set up after-hours answer, missed-call text-back, and booking into what you already run.

Worth a look, or is that covered?

Thomas Gates III
Gates Technologies · gatestech.solutions
```

### Example PASS: website Email 1
```
Subject: three fixes for your site

On plumberlocalpros.com the headline says "No Job Is To BIG".

Three things I'd fix:
1. Correct the typos on every page, starting with that headline.
2. Expand the About Us section so callers know who Plumber Local Pros is.
3. Rewrite the service blurbs into plain words about the jobs you actually take.

Gates rebuilds sites with booking built in. After-hours call coverage can come later if you want it.

Want me to walk you through them?

Thomas Gates III
Gates Technologies · gatestech.solutions
```
