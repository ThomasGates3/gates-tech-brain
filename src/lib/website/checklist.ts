/**
 * The blueprint's 20-point launch checklist (docs/website-blueprint.md) as data.
 * Our builds must ship all 20; the website-lane audit (field/actions observeSite)
 * checks a prospect's live site against the same list. Keep labels in sync with
 * the .md (website.test.ts enforces it).
 */
export interface ChecklistItem { n: number; label: string; audit: string }

export const LAUNCH_CHECKLIST: ChecklistItem[] = [
  { n: 1, label: "Privacy Policy", audit: "a privacy policy page linked from the site, with business contact details" },
  { n: 2, label: "Terms of Service", audit: "a terms of service page" },
  { n: 3, label: "Clear CTA above the fold", audit: "a call or quote/booking button visible without scrolling, repeated in the header or footer; phone is a tap-to-call tel: link" },
  { n: 4, label: "FAQ section", audit: "an FAQ answering real buyer questions" },
  { n: 5, label: "robots.txt", audit: "/robots.txt exists and lists the sitemap" },
  { n: 6, label: "sitemap.xml", audit: "/sitemap.xml exists and lists the pages" },
  { n: 7, label: "Custom 404 page", audit: "a made-up path shows a branded page with a link home, not a host error" },
  { n: 8, label: "Image alt text", audit: "images have descriptive alt text" },
  { n: 9, label: "Analytics hook", audit: "an analytics or tracking script is present" },
  { n: 10, label: "Meta titles", audit: "the page title names the service and city, not just the business name or \"Home\"" },
  { n: 11, label: "Meta descriptions", audit: "a meta description is set and reads like a search result" },
  { n: 12, label: "Social share tags", audit: "og:title, og:description, og:image and a Twitter card are set" },
  { n: 13, label: "Favicon + Apple Touch Icon", audit: "a brand favicon, not the builder's default or none" },
  { n: 14, label: "Canonical URLs", audit: "a canonical link is set" },
  { n: 15, label: "Cookie consent banner", audit: "if tracking scripts run, a cookie notice is shown" },
  { n: 16, label: "Mobile checked first", audit: "a viewport meta tag and a layout that fits a phone; tap targets usable, no sideways scroll" },
  { n: 17, label: "Accessibility pass", audit: "one H1 and ordered headings, readable contrast, labeled buttons and form fields" },
  { n: 18, label: "Forms tested end-to-end", audit: "a quote/contact form that works (fields, submit, a confirmation), not a dead form or mailto only" },
  { n: 19, label: "No broken links", audit: "nav, footer, CTA, tel: and map links all go somewhere real" },
  { n: 20, label: "Performance", audit: "modern image formats, lazy-loaded media, a poster on any hero video, no huge unoptimized images" },
];

/** Prompt lines for auditing a prospect's live site against the checklist. */
export const checklistAuditLines = () => LAUNCH_CHECKLIST.map((i) => `${i.n}. ${i.label}: ${i.audit}`).join("\n");
