# Gates Technologies Website Blueprint

Every client site we build follows this layout and ships with all 20 launch checklist items. It sits on top of the Master Website Prompt: where they differ, this blueprint wins.

## 1. Page layout and hero rules (do not trap the visitor on scroll)

**Step 1: Default hero.** Auto-playing, muted, looping background video showing the finished result or the walk-in, with a poster image. Pair it with a sharp headline and an immediate primary CTA ("Get a Quote" / "Order / Call Now"). Visitors must be able to scroll past the hero right away. No long scroll-jacking animation that locks the page.

**Step 2: "See the Transformation" section.** Further down the page. For service businesses (car wraps, epoxy garage floors, pressure washing, landscaping, roofing, remodeling), use a clean before-to-after scroll wipe or an interactive slider in this section only. A short scroll-driven hero is allowed ONLY when a showcase build explicitly asks for it. Label AI-generated before/after visuals as illustrations.

**Step 3: "Real Reviews" section.** Verified Google reviews only, never invented. Add commercial client logos where they apply.

**Step 4: Connected lead capture.** The quote/contact form is wired directly into our lead tracking sheet / GoHighLevel webhook, so every submission is logged automatically.

## 2. Mandatory 20-point launch checklist

Every client site must ship with all 20. Build and verify every item before opening a PR on a client website.

1. **Privacy Policy** page (`/privacy`) with business contact details.
2. **Terms of Service** page (`/terms`).
3. **Clear CTA above the fold**, repeated in the sticky header/footer (click-to-call + quote/booking button).
4. **FAQ section** on the home or service page answering real buyer questions, with `FAQPage` schema.
5. **robots.txt** (`app/robots.ts`) allowing crawlers and pointing to the sitemap.
6. **sitemap.xml** (`app/sitemap.ts`) auto-generated for all public routes, plus instructions in `LAUNCH_SEO.md` to submit it in Google Search Console.
7. **Custom 404 page** (`app/not-found.tsx`) with a clean link back home and click-to-call.
8. **Image alt text**: descriptive `alt` on every image, using natural local service + city keywords.
9. **Analytics hook** ready (Google Analytics / Vercel Analytics / GHL tracking script via env var).
10. **Meta titles** on every page: `[Primary Service] in [City, GA] | [Business Name]`.
11. **Meta descriptions** on every page, written to drive clicks from local Google searches.
12. **Social share tags**: Open Graph `og:title`, `og:description`, `og:image`, and Twitter card metadata, using the clean start frame or hero poster.
13. **Favicon + Apple Touch Icon** (`app/icon.png` / `app/apple-icon.png`) matching the client's brand colors/logo.
14. **Canonical URLs** (`alternates.canonical` in Next.js metadata) on every page.
15. **Cookie consent banner**: a lightweight, non-intrusive bar when analytics/tracking scripts are used.
16. **Mobile checked first**: 390px viewport tested with Playwright; thumb-friendly tap targets, no horizontal overflow.
17. **Accessibility pass**: heading hierarchy H1 → H2 → H3, readable contrast, ARIA labels on buttons/inputs, `prefers-reduced-motion` fallback for animations/videos.
18. **Forms tested end-to-end**: validation, loading state, confirmation message, and the webhook/sheet payload verified.
19. **No broken links** across nav, footer, CTAs, phone `tel:` links and map links.
20. **Performance**: WebP/AVIF images, lazy-loaded below-the-fold media, a poster image on the hero video, Lighthouse mobile 90+ target.

In the PR description, list all 20 with how each was verified.
