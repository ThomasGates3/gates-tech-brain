/**
 * Instagram Content Studio: the weekly posting queue on /content, the 4 brain_content_* tools,
 * and Claude regeneration. State is one JSON row in `settings` (same pattern as roadmap.ts and
 * whats-new.ts), seeded with a ready-to-shoot Week 1 pack. Cadence follows the @brandisocial
 * Slow/Fast playbook; Reels follow the @w.wearebrand 12-second monitor + hand-scroll format.
 */
import { generateText, Output } from "ai";
import { z } from "zod";
import { getSetting, setSetting } from "@/lib/settings";
import { recordActivity } from "@/lib/activity";
import { claudeBudget } from "@/lib/budget";
import { recordUsage } from "@/lib/usage";
import { claude, LIGHT, OPS } from "@/lib/models";

export type GrowthMode = "slow" | "fast";
export const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export type DayOfWeek = (typeof DAYS)[number];
export type ContentFormat = "reel" | "carousel" | "story";
export const STATUSES = ["idea", "drafted", "ready", "posted", "skipped"] as const;
export type ContentStatus = (typeof STATUSES)[number];

export interface DemoAssetPack {
  slug: string;
  businessName: string;
  vertical: "Custom Builder" | "Restaurant" | "Pool Builder" | "Auto Performance" | "E-Commerce" | "Med Spa";
  city: string;
  heroStyle: string;
  /** Live sample website the post shows off. Empty until it is deployed. */
  siteUrl: string;
  localMockupPath: string;
  defaultKeyword: string;
  keyProofPoints: string[];
}

export interface ContentSlotItem {
  id: string;
  weekOf: string;
  dayOfWeek: DayOfWeek;
  slotIndex: number;
  format: ContentFormat;
  tier: "both" | "fast_only";
  modes: GrowthMode[];
  status: ContentStatus;
  title: string;
  demoSlug: string;
  businessName: string;
  siteUrl: string;
  previewUrl?: string;
  topPillHook: string;
  topPillAlt?: string;
  gridCoverPrompt: string;
  shotList: string[];
  caption: string;
  ghlKeyword: string;
  ghlDmScript: string;
  postingTimeEt: string;
  createdBy: string;
  updatedAt: string;
  postedAt?: string | null;
  igPermalink?: string | null;
}

export interface ContentIdeaItem {
  id: string;
  title: string;
  format: ContentFormat;
  demoSlug: string;
  topPillHook: string;
  angleNote: string;
  ghlKeyword: string;
  referenceUrl?: string;
  createdBy: string;
  createdAt: string;
}

export interface ContentState { mode: GrowthMode; weekOf: string; items: ContentSlotItem[]; ideas: ContentIdeaItem[] }

// Live demo sites on Vercel. The showerhead demo has no site or repo yet (Thomas, 2026-10-28).

export const DEMO_CATALOG: DemoAssetPack[] = [
  {
    slug: "sinful-slidrz",
    businessName: "Sinful Slidrz",
    vertical: "Restaurant",
    city: "East Atlanta Village · 1245 Glenwood Ave SE",
    heroStyle: "BRASA-style interactive split screen + 3-stage Oxtail Sear / Plantain / Drip switcher",
    siteUrl: "https://sinful-sliderz.vercel.app",
    localMockupPath: "/workspace/mockups/sinful-slidrz",
    defaultKeyword: "MENU",
    keyProofPoints: [
      "22 high-res food and stall photos",
      "Ominous Oxtail ($8.75) and Wicked Jerk Slidrz",
      "Pick-2 Combo builder ($16.25)",
      '"FIND THE NEON" 3-step Southern Feed Store walk-in guide',
      "Live Toast ordering vs. their old broken Duda template showing 555-555-5555",
    ],
  },
  {
    slug: "stone-creek-construction",
    businessName: "Stone Creek Construction",
    vertical: "Custom Builder",
    city: "Ball Ground & Canton, GA",
    heroStyle: "4-stage wireframe-to-finish estate scroll ('Designed to the inch' → 'Rough in' → 'Cabinetry & Millwork' → 'Built to gather')",
    siteUrl: "https://stone-creek.vercel.app",
    localMockupPath: "/workspace/mockups/stone-creek-construction",
    defaultKeyword: "BUILD",
    keyProofPoints: [
      "Joe Lawson, 31+ years building in Georgia",
      "Custom North Georgia estates up to $2M",
      'Cherokee County "Silo House", Low Country Estate, Etowah River Estate',
      "Interactive custom home cost estimator + missed-call text-back",
    ],
  },
  {
    slug: "bennett-custom-pool-construction",
    businessName: "Bennett Custom Pool Construction",
    vertical: "Pool Builder",
    city: "Ball Ground & North Georgia",
    heroStyle: "Backyard excavation-to-resort pool scroll transformation + missed-call text-back",
    siteUrl: "https://bennett-pools.vercel.app",
    localMockupPath: "/workspace/mockups/bennett-custom-pool-construction",
    defaultKeyword: "POOL",
    keyProofPoints: [
      "Custom gunite infinity pools, spa spillovers, travertine decks",
      "Automated job-site missed-call recovery so $100K+ pool leads never hit voicemail",
    ],
  },
  {
    slug: "authentic-gyros-and-grill",
    businessName: "Authentic Gyros & Grill",
    vertical: "Restaurant",
    city: "Georgia Mediterranean spot",
    heroStyle: "5-second storefront walk-in hero + interactive visual menu",
    siteUrl: "https://authneticgyros.vercel.app",
    localMockupPath: "/workspace/mockups/authentic-gyros-and-grill",
    defaultKeyword: "GYRO",
    keyProofPoints: [
      "18 verified Square CDN dish photos",
      "Walk-in door transition straight to the sizzling spit and combo platters",
      "1-tap mobile ordering",
    ],
  },
  {
    slug: "iconic-legacies",
    businessName: "Iconic Legacies",
    vertical: "Auto Performance",
    city: "Performance & custom auto shop",
    heroStyle: "5-second matte-black garage bay roll-up reveal (red Supra on lift + black Trackhawk)",
    siteUrl: "https://iconic-legacies.vercel.app",
    localMockupPath: "/workspace/mockups/iconic-legacies",
    defaultKeyword: "SHOP",
    keyProofPoints: [
      "Ribbed matte-black bay door rolls up to a crimson Supra on a hydraulic lift and a twin-striped Trackhawk under hex LEDs",
      "4-gauge spec bar",
      '"Book a Bay" quote form',
    ],
  },
  {
    slug: "filtered-shower-store",
    businessName: "Filtered Showerhead Studio Film",
    vertical: "E-Commerce",
    city: "DTC e-commerce product scroll",
    heroStyle: "Apple-style 8-keyframe exploded product scroll + Day 1 vs. Day 90 cartridge proof",
    siteUrl: "",
    localMockupPath: "/workspace/mockups/filtered-shower-store",
    defaultKeyword: "STORE",
    keyProofPoints: ["8-stage exploded hardware scroll film", "KDF-55 + Calcium Sulfite filtration breakdown", "Day 1 vs. Day 90 visual filter proof"],
  },
];
export const demoBySlug = (slug: string) => DEMO_CATALOG.find((d) => d.slug === slug)

type Counts = { reel: number; carousel: number; story: number }
export interface CadenceDay { slow: Counts; fast: Counts; postingTimeEt: string; restDay: boolean; nightDrop: boolean }

/** The locked @brandisocial cadence. Saturday is off in both modes; Sunday is the 7:30 PM ET night drop. */
export const CADENCE_MATRIX: Record<DayOfWeek, CadenceDay> = {
  monday: { slow: { reel: 1, carousel: 0, story: 1 }, fast: { reel: 1, carousel: 1, story: 2 }, postingTimeEt: "11:00 AM ET", restDay: false, nightDrop: false },
  tuesday: { slow: { reel: 0, carousel: 0, story: 1 }, fast: { reel: 1, carousel: 0, story: 2 }, postingTimeEt: "12:00 PM ET", restDay: false, nightDrop: false },
  wednesday: { slow: { reel: 0, carousel: 1, story: 1 }, fast: { reel: 1, carousel: 1, story: 1 }, postingTimeEt: "12:00 PM ET", restDay: false, nightDrop: false },
  thursday: { slow: { reel: 1, carousel: 0, story: 1 }, fast: { reel: 0, carousel: 1, story: 2 }, postingTimeEt: "12:30 PM ET", restDay: false, nightDrop: false },
  friday: { slow: { reel: 0, carousel: 0, story: 2 }, fast: { reel: 1, carousel: 1, story: 2 }, postingTimeEt: "1:00 PM ET", restDay: false, nightDrop: false },
  saturday: { slow: { reel: 0, carousel: 0, story: 0 }, fast: { reel: 0, carousel: 0, story: 0 }, postingTimeEt: "OFF", restDay: true, nightDrop: false },
  sunday: { slow: { reel: 1, carousel: 0, story: 1 }, fast: { reel: 1, carousel: 0, story: 3 }, postingTimeEt: "7:30 PM ET Night Drop", restDay: false, nightDrop: true },
};
export const SATURDAY_NOTE =
  "Saturday is intentionally OFF in both Slow and Fast Growth modes (@brandisocial playbook). Go out, film B-roll in Atlanta if you spot a cool storefront, and let Friday's stories breathe."
export const SUNDAY_NOTE = "Post Sunday night so builders and owners see it first thing Monday morning."
export const dayTotal = (day: DayOfWeek, mode: GrowthMode) => Object.values(CADENCE_MATRIX[day][mode]).reduce((a, b) => a + b, 0)
export const weekTotals = (mode: GrowthMode) =>
  DAYS.reduce((t, d) => ({ reel: t.reel + CADENCE_MATRIX[d][mode].reel, carousel: t.carousel + CADENCE_MATRIX[d][mode].carousel, story: t.story + CADENCE_MATRIX[d][mode].story }), { reel: 0, carousel: 0, story: 0 })

// ── Week 1 pack ─────────────────────────────────────────────────────────────

type Seed = Omit<ContentSlotItem, "weekOf" | "tier" | "status" | "businessName" | "siteUrl" | "postingTimeEt" | "createdBy" | "updatedAt" | "gridCoverPrompt"> & { gridCoverPrompt?: string; postingTimeEt?: string }
const both: GrowthMode[] = ["slow", "fast"]
const fastOnly: GrowthMode[] = ["fast"]
const slowOnly: GrowthMode[] = ["slow"]

const SEED: Seed[] = [
  // Monday
  {
    id: "mon-reel-1", dayOfWeek: "monday", slotIndex: 1, format: "reel", modes: both, demoSlug: "stone-creek-construction",
    title: "Stone Creek 4-Stage Builder Scroll Transformation (@w.wearebrand 2.6M-view blueprint)",
    topPillHook: "Contractor websites in 2026 🫠",
    topPillAlt: "Why custom builders lose $200K+ jobs online 😬",
    gridCoverPrompt: "Lit North Georgia mountain estate at dusk, warm interior glow, dark slate border.",
    shotList: [
      '0.0s to 3.0s (Hero Stop): iPhone 9:16 vertical above right hand on mouse in front of monitor. Screen shows Stage 1 CAD wireframe ("Designed to the inch"). Top black pill reads "Contractor websites in 2026 🫠".',
      '3.0s to 7.0s (Scroll Pull 1 & 2): Hand scrolls the mouse wheel. Blueprint morphs into timber framing ("Rough in") and custom white-oak millwork ("Cabinetry & Millwork").',
      '7.0s to 12.0s (Scroll Pull 3 & Payoff): Final scroll finishes into the lit North Georgia custom mountain estate ("Built to gather") + Custom Home Cost Estimator and instant text-back CTA.',
    ],
    caption: `Comment "BUILD" and we’ll mock up what your builder website could look like.

Homeowners spending $500K to $2M+ check your website before they ever call you.

If your site still looks like a 2014 brochure, or sends calls to voicemail while you’re on a job site, you’re handing projects to the builder down the road.

We build scroll-driven websites for custom builders and remodelers with missed-call text-back and automated Google review requests built right in.

Comment "BUILD" and we’ll send you a custom preview link.

#customhomebuilder #generalcontractor #webdesign #remodeling #georgia #atlantabusiness #webdeveloper`,
    ghlKeyword: "BUILD",
    ghlDmScript: "Appreciate you checking out the Stone Creek build reel! 👷‍♂️ What’s the name of your construction/remodeling company (or drop your current website URL)? I’ll put together a custom 4-stage scroll preview showing how your projects would look.",
  },
  {
    id: "mon-story-1", dayOfWeek: "monday", slotIndex: 2, format: "story", modes: both, demoSlug: "stone-creek-construction",
    title: "Story share of Monday builder reel + poll sticker",
    topPillHook: "Would you trust a $1.5M builder with a 2012 website? 👀",
    shotList: [
      "Share the Stone Creek reel to your Story with a dark background border.",
      'Add an Instagram Poll Sticker: "Honest question: Does your website match the quality of your builds?" ("100% Yes 🔥" vs "Needs an upgrade 😅").',
      'Everyone who taps "Needs an upgrade 😅" gets a warm outbound DM.',
    ],
    caption: "Story overlay: Honest question. Does your website match the quality of your builds?",
    ghlKeyword: "BUILD",
    ghlDmScript: "Saw you tapped 'Needs an upgrade' 😅 What’s your company name or current site? I’ll send a quick 4-stage scroll preview idea.",
  },
  {
    id: "mon-story-2", dayOfWeek: "monday", slotIndex: 3, format: "story", modes: fastOnly, demoSlug: "stone-creek-construction",
    title: 'BTS monitor check: Cherokee County "Silo House" portfolio card',
    topPillHook: "Behind the build: Interactive Cost Estimator for North GA estates 📐",
    shotList: ['6-second boomerang or pan across the Stone Creek cost estimator slider on your monitor + Link Sticker to gatestech.solutions (or "DM \'BUILD\' for a preview").'],
    caption: "Story overlay: Behind the build. Interactive cost estimator for North GA estates. DM BUILD for a preview.",
    ghlKeyword: "BUILD",
    ghlDmScript: "Here’s the idea behind the Stone Creek estimator 📐 What do you build? Drop your site and I’ll show you how an estimator would work for your projects.",
  },
  {
    id: "mon-carousel-1", dayOfWeek: "monday", slotIndex: 4, format: "carousel", modes: fastOnly, demoSlug: "stone-creek-construction",
    title: "5-slide breakdown: why custom builders lose high-ticket estimates before the phone rings",
    topPillHook: "3 Website Mistakes Costing Custom Builders $200K+ Projects",
    shotList: [
      'Slide 1 (Cover): Dark architectural slate cover. "3 Website Mistakes Costing Custom Builders $200K+ Projects (And How We Fixed Them for Stone Creek)".',
      "Slide 2: Mistake #1: Static photo galleries with zero build story. Fix: 4-stage CAD wireframe-to-finish scroll hero.",
      'Slide 3: Mistake #2: "Contact Us" forms that sit unanswered for 48 hours. Fix: Interactive ballpark estimator + instant SMS follow-up.',
      "Slide 4: Mistake #3: Calls going to voicemail on a noisy job site. Fix: Automated missed-call text-back in under 10 seconds.",
      'Slide 5 (CTA): "Comment \'BUILD\' and we’ll mock up your homepage for free."',
    ],
    caption: `Comment "BUILD" and we’ll mock up your homepage for free.

Swipe for the 3 website mistakes we fixed for Stone Creek Construction, from static galleries to calls that went to voicemail.

#customhomebuilder #contractor #webdesign #georgia #remodeling`,
    ghlKeyword: "BUILD",
    ghlDmScript: "Thanks for swiping through! 👷‍♂️ What’s your company name or website? I’ll mock up a homepage preview with the 3 fixes applied.",
  },
  // Tuesday
  {
    id: "tue-story-1", dayOfWeek: "tuesday", slotIndex: 1, format: "story", modes: both, demoSlug: "sinful-slidrz",
    title: 'Behind-the-scenes story: fixing the "555-555-5555" restaurant website mistake (Sinful Slidrz)',
    topPillHook: "We found 555-555-5555 on a real Atlanta restaurant site 😭➡️🔥",
    shotList: [
      "Frame 1 (3s): Quick photo or clip of the old broken template header showing the placeholder 555-555-5555 and mymail@mailservice.com.",
      'Frame 2 (5s): Pan up to your monitor showing the new Sinful Slidrz BRASA-style site ("EAST ATLANTA. MAIN CHARACTER.") with Ominous Oxtail + Wicked Jerk Slidrz and the [01. SEAR & BRAISE] → [02. CROWN WITH PLANTAIN] → [03. DRIP IN SINFUL SAUCE] switcher.',
      'Sticker: Question or Emoji Slider Sticker, or "Reply \'MENU\' if you know an Atlanta spot that deserves a site like this 👇".',
    ],
    caption: "Story text overlay: Amazing food in East Atlanta Village, but their old template still had 555-555-5555 in the header. Here's the interactive rebuild we just finished. Reply 'MENU' to see the live demo.",
    ghlKeyword: "MENU",
    ghlDmScript: "Here’s the interactive Sinful Slidrz preview! 🍔🔥 Do you run a restaurant/food brand or know an owner whose website needs an upgrade like this? Drop the @ or website link and I'll put a custom concept together.",
  },
  {
    id: "tue-reel-1", dayOfWeek: "tuesday", slotIndex: 2, format: "reel", modes: fastOnly, demoSlug: "sinful-slidrz",
    title: "Sinful Slidrz interactive BRASA-style menu & combo builder (@w.wearebrand 21M-view burger blueprint)",
    topPillHook: "Restaurant websites in 2026 🤤",
    topPillAlt: "When the website looks as good as the oxtail sliders 🤤",
    gridCoverPrompt: "Close crop of oxtail sliders dripping sauce under purple neon, dark backdrop.",
    shotList: [
      '0.0s to 3.0s (Hero Stop): iPhone 9:16 vertical framing your monitor + right hand on the mouse. Screen shows "EAST ATLANTA. MAIN CHARACTER. SINFULLY STACKED." with Ominous Oxtail & Wicked Jerk Slidrz.',
      '3.0s to 7.0s (Interactive Clicks): Hand clicks through [01. SEAR & BRAISE] → [02. CROWN WITH PLANTAIN] → [03. DRIP IN SINFUL SAUCE], then scrolls to "BUILD YOUR PICK-2 ($16.25)".',
      '7.0s to 11.5s (Walk-In Neon Guide + Toast CTA): Scroll lands on "FIND THE NEON" (3-step Southern Feed Store walk-in guide) and the 1-tap Toast order button.',
    ],
    caption: `Comment "MENU" if your restaurant needs an upgrade like this.

Most local food spots have incredible food and a broken template site with no real photos, outdated prices, or dead links.

When people are hungry, they eat with their eyes first.

Comment "MENU" and we’ll build a custom homepage preview for your spot.

#atlantafood #eastatlanta #restaurantmarketing #webdesign #foodphotography #webdeveloper #smallbusiness`,
    ghlKeyword: "MENU",
    ghlDmScript: "Appreciate you tapping in on the Sinful Slidrz reel! 🍔🔥 What’s the name of your restaurant (or drop your IG/website)? I’ll mock up an interactive homepage preview using your real menu items.",
  },
  {
    id: "tue-story-2", dayOfWeek: "tuesday", slotIndex: 3, format: "story", modes: fastOnly, demoSlug: "sinful-slidrz",
    title: 'Pick-2 combo interactive poll (Ominous Oxtail vs Wicked Jerk vs 6" Seafood Egg Roll)',
    topPillHook: "Testing the interactive Pick-2 Combo builder for East Atlanta 🍔",
    shotList: ['6-second clip clicking Ominous Oxtail + Sensuous Shrimp + Mixed Fry Bag on the Sinful Slidrz combo builder with a Poll Sticker: "Would this make you order faster than a PDF menu?" ("Way faster 🔥" / "100% Yes").'],
    caption: "Story overlay: Would this make you order faster than a PDF menu?",
    ghlKeyword: "MENU",
    ghlDmScript: "Glad you voted! 🍔 Want a combo builder like this for your spot? Drop your restaurant name or link and I’ll sketch it out.",
  },
  // Wednesday
  {
    id: "wed-carousel-1", dayOfWeek: "wednesday", slotIndex: 1, format: "carousel", modes: both, demoSlug: "sinful-slidrz",
    title: 'Before/after breakdown: from "555-555-5555" template to interactive streetwear food brand',
    topPillHook: "How We Turned a Broken Restaurant Template Into a 24/7 Ordering Machine",
    shotList: [
      'Slide 1 (Cover): High-contrast split cover. "BEFORE vs. AFTER: Rebuilding an East Atlanta Food Stall\'s Digital Storefront".',
      "Slide 2 (The Problem): Old Duda template still showing 555-555-5555, stock pasta photos on a slider spot, and a hidden location inside Southern Feed Store.",
      "Slide 3 (Fix #1, Hero & 3-Stage Stack): Leading with real Ominous Oxtail & Wicked Jerk photos + interactive [01. SEAR] → [02. PLANTAIN] → [03. SAUCE] stage switcher.",
      "Slide 4 (Fix #2, Interactive Pick-2 Builder & 'Find The Neon'): Visual $16.25 Pick-2 combo customizer + 3-step photo walk-in guide from Glenwood Ave straight to the purple neon devil sign.",
      'Slide 5 (CTA): "Comment \'AUDIT\' and we’ll send you a 3-fix review + homepage preview for your business."',
    ],
    caption: `Comment "AUDIT" and we’ll check your website + build you a preview.

You’d be shocked how many great Atlanta businesses lose customers to broken mobile layouts, template placeholder numbers, and hidden ordering links.

Swipe through to see the 3 exact fixes we built for Sinful Slidrz in East Atlanta Village, from interactive menu stages to a 3-step visual walk-in guide.

Comment "AUDIT" and we’ll send you a custom 3-fix review + preview link.

#atlantabusiness #webdesign #restaurantowner #smallbusinessgrowth #digitalagency #websiteaudit`,
    ghlKeyword: "AUDIT",
    ghlDmScript: "Thanks for checking out the Before/After breakdown! 🔍 Drop your current website URL (or business name + city) right here and I’ll send over the 3 highest-impact fixes + a homepage preview.",
  },
  {
    id: "wed-story-1", dayOfWeek: "wednesday", slotIndex: 2, format: "story", modes: both, demoSlug: "sinful-slidrz",
    title: 'Story share of before/after carousel + "Drop your URL" question box',
    topPillHook: "Want us to roast & rebuild your homepage for free? 👇",
    shotList: ['Share Slide 1 of the Wednesday carousel to Story + Question Sticker: "Drop your website URL for a free 3-fix review".'],
    caption: "Story overlay: Drop your website URL for a free 3-fix review 👇",
    ghlKeyword: "AUDIT",
    ghlDmScript: "Got your link! 🔍 I’ll send the 3 highest-impact fixes and a homepage preview shortly.",
  },
  {
    id: "wed-reel-1", dayOfWeek: "wednesday", slotIndex: 3, format: "reel", modes: fastOnly, demoSlug: "iconic-legacies",
    title: "Iconic Legacies 5-second garage bay roll-up reveal (red Supra + black Trackhawk)",
    topPillHook: "Auto shop websites in 2026 🏎️💨",
    topPillAlt: "Claude Code can't do this 🥱",
    gridCoverPrompt: "Crimson Supra on a hydraulic lift under hex LEDs, matte-black bay door half open.",
    shotList: [
      "0.0s to 2.5s: Hand scrolls on monitor. Matte-black ribbed steel garage door rolls up into the ceiling tracks, revealing the crimson Toyota Supra on the hydraulic lift and black Trackhawk under hex LEDs.",
      '2.5s to 7.0s: "BUILT FOR THE STREET. TUNED FOR LEGACY." headline fades in + scroll down to the 4-gauge RPM/MPH spec bar.',
      '7.0s to 12.0s: Click "Currently on the Lift" interactive build cards + "Book a Bay" quote form.',
    ],
    caption: "Comment 'SHOP' and we’ll show you what a scroll-driven garage roll-up website looks like for your shop. #autoshop #customcars #webdesign #webdeveloper #atlantacars #tuning",
    ghlKeyword: "SHOP",
    ghlDmScript: "Appreciate you checking out the Iconic Legacies bay reveal! 🏎️ What kind of shop or service business do you run? Drop your link and I'll mock up a walk-in reveal concept for you.",
  },
  // Thursday
  {
    id: "thu-reel-1", dayOfWeek: "thursday", slotIndex: 1, format: "reel", modes: slowOnly, demoSlug: "bennett-custom-pool-construction",
    title: '"What happens when a builder misses a call in 2026" (Bennett Custom Pools monitor + iPhone desk setup)',
    topPillHook: "What happens when a builder misses a call in 2026 📲",
    gridCoverPrompt: "Desk shot: monitor with a lit infinity pool, iPhone beside the keyboard showing a text-back.",
    shotList: [
      "0.0s to 3.5s: Monitor shows the Bennett Custom Pool Construction scroll website transforming from backyard excavation to a lit resort infinity pool.",
      "3.5s to 8.0s: Camera pans to the iPhone next to the Magic Keyboard showing a missed call immediately followed by an automatic SMS text-back: \"Hey! We're out on a pool build right now. What kind of project are you looking to price out?\"",
      "8.0s to 12.0s: Back to the monitor showing the lead captured on the dashboard.",
    ],
    caption: `Comment "SYSTEM" to see how this works for your business.

A great website gets the homeowner to call.
Missed-call text-back makes sure they don’t call the next contractor on Google while you’re on a job site or in a client meeting.

Comment "SYSTEM" and we’ll show you how we plug both into your business in 7 days.

#poolbuilder #custompools #generalcontractor #homebuilders #missedcalltextback #webdesign #georgia`,
    ghlKeyword: "SYSTEM",
    ghlDmScript: "Appreciate you checking out the missed-call recovery reel! 📲 What trade or local business are you in? I’ll send you a quick walkthrough of how the scroll website + instant text-back system works.",
  },
  {
    id: "thu-carousel-1", dayOfWeek: "thursday", slotIndex: 2, format: "carousel", modes: fastOnly, demoSlug: "bennett-custom-pool-construction",
    title: "How one missed job-site call costs pool & home builders big projects (and the 10-second fix)",
    topPillHook: "What Happens in the 4 Minutes After You Miss a Homeowner's Call",
    shotList: [
      "Slide 1: \"What Happens in the 4 Minutes After You Miss a Homeowner's Call\".",
      "Slide 2: Minute 1: Homeowner visits your site, calls from Google, and hits your voicemail while you're on an excavator.",
      "Slide 3: Minute 2: Most homeowners don't leave a voicemail. They hit the Back button and call the next builder on Google.",
      "Slide 4: The Gates Tech fix: premium scroll website + instant 10-second SMS text-back that books the estimate automatically.",
      "Slide 5: \"Comment 'SYSTEM' to see the live demo on your phone.\"",
    ],
    caption: "Comment 'SYSTEM' to test our live missed-call text-back + custom builder website setup. #poolbuilder #contractorlife #smallbusinesssystems #webdesign",
    ghlKeyword: "SYSTEM",
    ghlDmScript: "Sent! 📲 Want me to show you how the instant text-back + website setup looks for your company? Drop your business name or website link!",
  },
  {
    id: "thu-story-1", dayOfWeek: "thursday", slotIndex: 3, format: "story", modes: both, demoSlug: "bennett-custom-pool-construction",
    title: "Story share of Thursday post + job-site voicemail poll",
    topPillHook: "Be honest: How many calls go to voicemail when you're on a job site? 📞",
    shotList: ["Share Thursday's post + Poll Sticker (\"Zero, we catch 'em all\" vs \"Too many 😅\")."],
    caption: "Story overlay: Be honest. How many calls go to voicemail when you're on a job site?",
    ghlKeyword: "SYSTEM",
    ghlDmScript: "Saw your vote 📞 Want to see how instant text-back would catch those calls for your business? Drop your company name.",
  },
  {
    id: "thu-story-2", dayOfWeek: "thursday", slotIndex: 4, format: "story", modes: fastOnly, demoSlug: "authentic-gyros-and-grill",
    title: "Quick desk preview: Authentic Gyros & Grill 5-second walk-in hero",
    topPillHook: "Sneak peek: 5-second storefront walk-in hero for Authentic Gyros 🥙",
    shotList: ["7-second clip scrolling from the exterior door straight into the kitchen counter + \"Reply 'DEMO' if you want a walk-in site for your business\"."],
    caption: "Story overlay: Sneak peek of a 5-second walk-in hero. Reply DEMO if you want one for your business.",
    ghlKeyword: "DEMO",
    ghlDmScript: "Here’s the walk-in hero preview 🥙 What’s your business? Drop your link and I’ll sketch a walk-in concept for you.",
  },
  // Friday
  {
    id: "fri-story-1", dayOfWeek: "friday", slotIndex: 1, format: "story", modes: both, demoSlug: "stone-creek-construction",
    title: "Friday demo roundup: which build should we drop next?",
    topPillHook: "4 custom website builds on the desk this week 🖥️ Which industry next?",
    shotList: ['Quick pan across your monitor tabs showing Stone Creek Construction, Sinful Slidrz, Bennett Custom Pools, and Iconic Legacies + Poll Sticker ("More Contractors/Builders 🏗️" vs "More Restaurants/Auto 🔥").'],
    caption: "Story overlay: 4 builds on the desk this week. Which industry should we drop next?",
    ghlKeyword: "DEMO",
    ghlDmScript: "Thanks for voting! 🖥️ What industry are you in? Drop your link and I’ll put your business in next week’s lineup.",
  },
  {
    id: "fri-story-2", dayOfWeek: "friday", slotIndex: 2, format: "story", modes: both, demoSlug: "bennett-custom-pool-construction",
    title: "Weekend free preview slot offer (2 spots before Sunday night)",
    topPillHook: "Building 2 free custom homepage previews this weekend ⚡",
    shotList: ["Clean dark HUD story card: \"If you run a local business in GA (builder, remodeler, med spa, restaurant, auto shop) and want to see what a 2026 scroll-driven website looks like with your real brand, reply 'DEMO' with your URL.\""],
    caption: "Story overlay: Building 2 free homepage previews this weekend. Reply DEMO with your URL.",
    ghlKeyword: "DEMO",
    ghlDmScript: "You’re in the running for a weekend preview ⚡ Drop your website URL and business name and I’ll confirm by Sunday night.",
  },
  {
    id: "fri-reel-1", dayOfWeek: "friday", slotIndex: 3, format: "reel", modes: fastOnly, demoSlug: "filtered-shower-store",
    title: "Apple-style 8-keyframe exploded product scroll (Filtered Showerhead studio film)",
    topPillHook: "E-commerce websites in 2026 🫠",
    topPillAlt: "Sorry but Shopify templates can't do this 🥱",
    gridCoverPrompt: "Brushed-nickel showerhead exploded into parts mid-air on a black studio backdrop.",
    shotList: [
      "0.0s to 3.5s: Hand scrolls mouse on monitor. Brushed-nickel filtered showerhead explodes mid-air into 8 studio keyframes showing the KDF-55 + Calcium Sulfite cartridge.",
      "3.5s to 7.5s: Interactive slider reveals the Day 1 vs. Day 90 used filter proof card.",
      "7.5s to 12.0s: Smooth re-assembly into the subscription checkout module.",
    ],
    caption: "Comment 'STORE' and we’ll show you how to turn a standard product page into an Apple-level scroll experience. #ecommerce #shopify #webdesign #productdesign #brandbuilding #webdeveloper",
    ghlKeyword: "STORE",
    ghlDmScript: "Appreciate you checking out the 8-stage product scroll reel! ⚡ What product or brand are you building? Drop your store link and I’ll share how we build scroll-scrubbed product heroes.",
  },
  {
    id: "fri-carousel-1", dayOfWeek: "friday", slotIndex: 4, format: "carousel", modes: fastOnly, demoSlug: "authentic-gyros-and-grill",
    title: "Why walk-in hero websites beat standard templates",
    topPillHook: "Why 'Walk-In' Websites Are Replacing Boring Hero Banners in 2026",
    shotList: [
      "Slide 1: Cover.",
      "Slide 2: The first 2.5 seconds rule: zero text blocking the door opening.",
      "Slide 3: Real verified dish and project photos vs. stock photos.",
      "Slide 4: \"Comment 'DEMO' for a custom preview\".",
    ],
    caption: "Comment 'DEMO' for a custom walk-in preview of your storefront. #restaurantmarketing #webdesign #smallbusiness #atlanta",
    ghlKeyword: "DEMO",
    ghlDmScript: "Love it! 🥙 Drop your business name or link and I’ll mock up a walk-in hero with your real photos.",
  },
  // Sunday (7:30 PM ET night drop for Monday morning)
  {
    id: "sun-reel-1", dayOfWeek: "sunday", slotIndex: 1, format: "reel", modes: both, demoSlug: "bennett-custom-pool-construction",
    title: "Sunday night flagship reel: backyard dirt to luxury infinity pool scroll (Bennett Custom Pools)",
    topPillHook: "Pool builder websites in 2026 🌊",
    topPillAlt: "Claude Code can't do that 🤤",
    gridCoverPrompt: "Twilight infinity pool with fire bowls and LED water features, travertine deck.",
    shotList: [
      "0.0s to 3.0s (Hero Stop): Post at 7:30 PM ET Sunday so contractors and owners see it first thing Monday morning. Monitor + right hand on mouse showing Stage 1 backyard grading and steel rebar cage.",
      "3.0s to 7.5s (Scroll Pull): Hand scrolls. Shotcrete shell transforms into travertine coping, LED water features, and twilight fire bowls.",
      '7.5s to 12.0s (Payoff): Interactive pool project calculator + "Get Your Backyard Estimate" CTA.',
    ],
    caption: `Comment "POOL" and we’ll show you what your website could become.

Your website is often the first place homeowners experience your craftsmanship.
So why make it feel ordinary?

An immersive scroll-driven website grabs attention, builds instant trust for $100K+ backyard builds, and captures every lead automatically.

Comment "POOL" and let’s rethink your digital presence before Monday morning.

#poolbuilder #outdoorliving #custompools #landscapeconstruction #webdesign #georgia #webdeveloper`,
    ghlKeyword: "POOL",
    ghlDmScript: "Appreciate you checking out the Bennett Custom Pool reel! 🌊 What’s the name of your pool or outdoor living company (or drop your current site)? I’ll mock up a custom scroll preview for you.",
  },
  {
    id: "sun-story-1", dayOfWeek: "sunday", slotIndex: 2, format: "story", modes: both, demoSlug: "bennett-custom-pool-construction",
    title: "Sunday night story share of pool reel + Monday morning teaser",
    topPillHook: "New build just dropped for Monday morning 🌊 Tap to watch the scroll",
    shotList: ['Share the Sunday 7:30 PM reel to Story with "Tap to see the backyard-to-resort scroll transformation" + "Reply \'POOL\' for a custom preview".'],
    caption: "Story overlay: New build just dropped. Tap to watch the scroll. Reply POOL for a custom preview.",
    ghlKeyword: "POOL",
    ghlDmScript: "Here you go 🌊 What’s your pool or outdoor living company? I’ll mock up a scroll preview for you.",
  },
  {
    id: "sun-story-2", dayOfWeek: "sunday", slotIndex: 3, format: "story", modes: fastOnly, demoSlug: "stone-creek-construction",
    title: "Sunday night prep: this week's client build lineup",
    topPillHook: "Monday morning lineup locked in 🔒",
    shotList: ["Desk shot of your monitor + notebook or Brain dashboard showing 3 client builds queued for Monday."],
    caption: "Story overlay: Monday morning lineup locked in.",
    ghlKeyword: "DEMO",
    ghlDmScript: "Want your business in next week’s lineup? 🔒 Drop your link and I’ll send a preview.",
  },
  {
    id: "sun-story-3", dayOfWeek: "sunday", slotIndex: 4, format: "story", modes: fastOnly, demoSlug: "sinful-slidrz",
    title: 'Direct call-out sticker: "Need a website or missed-call system this week?"',
    topPillHook: "Taking on 2 new Georgia builds this week. DM 'DEMO' to claim a preview",
    shotList: ['Clean CTA card with Link Sticker to gatestech.solutions and "DM \'DEMO\' to wake up to a custom preview on Monday".'],
    caption: "Story overlay: Taking on 2 new Georgia builds this week. DM DEMO to claim a preview.",
    ghlKeyword: "DEMO",
    ghlDmScript: "You’re on the list! 🚀 Drop your business name and website and I’ll have a preview ready Monday.",
  },
]

export const SEED_IDEAS: Omit<ContentIdeaItem, "createdAt">[] = [
  { id: "idea-gyros-reel", title: "Authentic Gyros walk-in reel", format: "reel", demoSlug: "authentic-gyros-and-grill", topPillHook: "Restaurant websites in 2026 🥙", angleNote: "Door opens straight onto the spit; end on 1-tap ordering.", ghlKeyword: "GYRO", createdBy: "brain" },
  { id: "idea-builder-estimator", title: "Estimator-only carousel for remodelers", format: "carousel", demoSlug: "stone-creek-construction", topPillHook: "Price your kitchen in 30 seconds 📐", angleNote: "Show the estimator slider frame by frame.", ghlKeyword: "BUILD", createdBy: "brain" },
]

// ── State ───────────────────────────────────────────────────────────────────

const KEY = "content_studio_state_v1"
const TZ = "America/New_York"
const nowEt = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).replace(",", "") + " ET"

export function todayEt(at = new Date()): DayOfWeek {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long" }).format(at).toLowerCase() as DayOfWeek
}

/** Monday of the current ET week, YYYY-MM-DD. */
export function weekOfEt(at = new Date()): string {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(at)
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - DAYS.indexOf(todayEt(at)))
  return d.toISOString().slice(0, 10)
}

function expand(s: Seed, weekOf: string, at: string): ContentSlotItem {
  const demo = demoBySlug(s.demoSlug)
  return {
    ...s,
    weekOf,
    tier: s.modes.includes("slow") ? "both" : "fast_only",
    status: "ready",
    businessName: demo?.businessName ?? s.demoSlug,
    siteUrl: demo?.siteUrl ?? "",
    postingTimeEt: s.postingTimeEt ?? CADENCE_MATRIX[s.dayOfWeek].postingTimeEt,
    gridCoverPrompt: s.gridCoverPrompt ?? "",
    createdBy: "brain",
    updatedAt: at,
    postedAt: null,
  }
}

export function seedState(at = new Date()): ContentState {
  const stamp = at.toISOString()
  const weekOf = weekOfEt(at)
  return { mode: "slow", weekOf, items: SEED.map((s) => expand(s, weekOf, stamp)), ideas: SEED_IDEAS.map((i) => ({ ...i, createdAt: stamp })) }
}

export async function getContentState(): Promise<ContentState> {
  let state: ContentState
  try {
    state = JSON.parse((await getSetting(KEY)) ?? "") as ContentState
  } catch {
    state = seedState()
  }
  // A new ET week: keep the content, reset posted/skipped so the board starts fresh.
  const wk = weekOfEt()
  if (state.weekOf !== wk) {
    state = { ...state, weekOf: wk, items: state.items.map((i) => (i.status === "posted" || i.status === "skipped" ? { ...i, weekOf: wk, status: "ready", postedAt: null } : { ...i, weekOf: wk })) }
    await save(state)
  }
  return state
}

async function save(state: ContentState) {
  await setSetting(KEY, JSON.stringify(state))
}

export class ContentError extends Error { constructor(public status: number, msg: string) { super(msg) } }

/** Slots active for a mode on a day, in posting order. */
export const slotsFor = (state: ContentState, day: DayOfWeek, mode: GrowthMode) =>
  state.items.filter((i) => i.dayOfWeek === day && i.modes.includes(mode)).sort((a, b) => a.slotIndex - b.slotIndex)

function nextDrop(state: ContentState, mode: GrowthMode, today: DayOfWeek): string {
  const start = DAYS.indexOf(today)
  for (let k = 0; k < 7; k++) {
    const day = DAYS[(start + k) % 7]
    const open = slotsFor(state, day, mode).filter((i) => i.status !== "posted" && i.status !== "skipped")
    if (open.length && !CADENCE_MATRIX[day].restDay) {
      const when = k === 0 ? "Today" : day.slice(0, 1).toUpperCase() + day.slice(1, 3)
      return `${when} ${CADENCE_MATRIX[day].postingTimeEt}`
    }
  }
  return "All posted this week"
}

export async function getTodayContent(opts: { day?: DayOfWeek; mode?: GrowthMode } = {}) {
  const state = await getContentState()
  const mode = opts.mode ?? state.mode
  const today = todayEt()
  const day = opts.day ?? today
  const slots = slotsFor(state, day, mode)
  const week = DAYS.flatMap((d) => slotsFor(state, d, mode))
  return {
    day,
    today,
    mode,
    is_rest_day: CADENCE_MATRIX[day].restDay,
    night_drop: CADENCE_MATRIX[day].nightDrop,
    posting_time_et: CADENCE_MATRIX[day].postingTimeEt,
    note: CADENCE_MATRIX[day].restDay ? SATURDAY_NOTE : CADENCE_MATRIX[day].nightDrop ? SUNDAY_NOTE : undefined,
    progress: {
      day_posted: slots.filter((s) => s.status === "posted").length,
      day_total: slots.length,
      week_posted: week.filter((s) => s.status === "posted").length,
      week_total: week.length,
    },
    next_drop: nextDrop(state, mode, today),
    slots,
  }
}

export async function listContentItems(f: { mode?: GrowthMode; day_of_week?: DayOfWeek; status?: ContentStatus; format?: ContentFormat } = {}) {
  const state = await getContentState()
  const items = state.items
    .filter((i) => (!f.mode || i.modes.includes(f.mode)) && (!f.day_of_week || i.dayOfWeek === f.day_of_week) && (!f.status || i.status === f.status) && (!f.format || i.format === f.format))
    .sort((a, b) => DAYS.indexOf(a.dayOfWeek) - DAYS.indexOf(b.dayOfWeek) || a.slotIndex - b.slotIndex)
  return { mode: state.mode, week_of: state.weekOf, items, ideas: state.ideas, demos: DEMO_CATALOG, cadence: CADENCE_MATRIX }
}

/** Everything the /content page needs in one call. */
export async function board() {
  const [list, today] = await Promise.all([listContentItems(), getTodayContent()])
  return { ...list, today }
}
export type Board = Awaited<ReturnType<typeof board>>

export async function setContentMode(mode: GrowthMode, by: string) {
  const state = await getContentState()
  state.mode = mode
  await save(state)
  await recordActivity({ kind: "updated", target: `IG Studio switched to ${mode === "fast" ? "FAST" : "SLOW"} growth`, because: `by ${by}`, agent: by })
  return state
}

/** Brain copy rule: no em or en dashes in anything that might get posted. */
function noDashes(fields: Record<string, unknown>) {
  const bad = Object.entries(fields).find(([, v]) => (Array.isArray(v) ? v.join(" ") : typeof v === "string" ? v : "").match(/[—–]/))
  if (bad) throw new ContentError(422, `No em or en dashes in ${bad[0]}. Use a comma or a period.`)
}
/** Claude output gets the same rule applied mechanically. */
const stripDashes = (s: string) => s.replace(/\s*[—–]\s*/g, ", ")

export interface UpsertInput {
  id?: string
  as_idea?: boolean
  set_mode?: GrowthMode
  day_of_week?: DayOfWeek
  format?: ContentFormat
  modes?: GrowthMode[]
  status?: ContentStatus
  title?: string
  demo_slug?: string
  site_url?: string
  top_pill_hook?: string
  top_pill_alt?: string
  shot_list?: string[]
  caption?: string
  ghl_keyword?: string
  ghl_dm_script?: string
  posting_time_et?: string
  angle_note?: string
}

export async function upsertContentItem(input: UpsertInput, by: string) {
  noDashes({ title: input.title, top_pill_hook: input.top_pill_hook, top_pill_alt: input.top_pill_alt, shot_list: input.shot_list, caption: input.caption, ghl_dm_script: input.ghl_dm_script, angle_note: input.angle_note })
  if (input.set_mode) await setContentMode(input.set_mode, by)
  const onlyMode = input.set_mode && Object.keys(input).filter((k) => input[k as keyof UpsertInput] !== undefined && k !== "set_mode" && k !== "as_idea").length === 0
  if (onlyMode) return { mode: input.set_mode }
  if (input.as_idea) return { idea: await addContentIdea(input, by) }

  const state = await getContentState()
  const at = new Date().toISOString()
  const existing = input.id ? state.items.find((i) => i.id === input.id) : undefined
  if (input.id && !existing) throw new ContentError(404, `No content slot "${input.id}". Use brain_content_list to see slot ids.`)
  const demoSlug = input.demo_slug ?? existing?.demoSlug ?? DEMO_CATALOG[0].slug
  const demo = demoBySlug(demoSlug)
  if (!existing) {
    if (!input.day_of_week || !input.format || !input.title || !input.top_pill_hook)
      throw new ContentError(422, "A new slot needs day_of_week, format, title and top_pill_hook.")
  }
  const base: ContentSlotItem = existing ?? {
    id: `${input.day_of_week!.slice(0, 3)}-${input.format}-${Date.now().toString(36)}`,
    weekOf: state.weekOf,
    dayOfWeek: input.day_of_week!,
    slotIndex: Math.max(0, ...state.items.filter((i) => i.dayOfWeek === input.day_of_week).map((i) => i.slotIndex)) + 1,
    format: input.format!,
    tier: "both",
    modes: input.modes ?? ["slow", "fast"],
    status: "drafted",
    title: "",
    demoSlug,
    businessName: demo?.businessName ?? demoSlug,
    siteUrl: demo?.siteUrl ?? "",
    topPillHook: "",
    gridCoverPrompt: "",
    shotList: [],
    caption: "",
    ghlKeyword: demo?.defaultKeyword ?? "DEMO",
    ghlDmScript: "",
    postingTimeEt: CADENCE_MATRIX[input.day_of_week!].postingTimeEt,
    createdBy: by,
    updatedAt: at,
    postedAt: null,
  }
  const next: ContentSlotItem = {
    ...base,
    dayOfWeek: input.day_of_week ?? base.dayOfWeek,
    format: input.format ?? base.format,
    modes: input.modes ?? base.modes,
    status: input.status ?? base.status,
    title: input.title ?? base.title,
    demoSlug,
    businessName: input.demo_slug ? demo?.businessName ?? demoSlug : base.businessName,
    siteUrl: input.site_url ?? (input.demo_slug ? demo?.siteUrl ?? base.siteUrl : base.siteUrl),
    topPillHook: input.top_pill_hook ?? base.topPillHook,
    topPillAlt: input.top_pill_alt ?? base.topPillAlt,
    shotList: input.shot_list ?? base.shotList,
    caption: input.caption ?? base.caption,
    ghlKeyword: (input.ghl_keyword ?? base.ghlKeyword).toUpperCase(),
    ghlDmScript: input.ghl_dm_script ?? base.ghlDmScript,
    postingTimeEt: input.posting_time_et ?? base.postingTimeEt,
    updatedAt: at,
  }
  next.tier = next.modes.includes("slow") ? "both" : "fast_only"
  if (input.status === "posted" && base.status !== "posted") next.postedAt = nowEt()
  if (input.status && input.status !== "posted") next.postedAt = null
  state.items = existing ? state.items.map((i) => (i.id === next.id ? next : i)) : [...state.items, next]
  await save(state)
  return { item: next }
}

export async function updateContentStatus(id: string, status: ContentStatus, by: string) {
  return upsertContentItem({ id, status }, by)
}

export async function addContentIdea(input: UpsertInput, by: string): Promise<ContentIdeaItem> {
  if (!input.title || !input.format) throw new ContentError(422, "An idea needs a title and a format.")
  noDashes({ title: input.title, top_pill_hook: input.top_pill_hook, angle_note: input.angle_note })
  const state = await getContentState()
  const demoSlug = input.demo_slug ?? DEMO_CATALOG[0].slug
  const idea: ContentIdeaItem = {
    id: `idea-${Date.now().toString(36)}`,
    title: input.title,
    format: input.format,
    demoSlug,
    topPillHook: input.top_pill_hook ?? "",
    angleNote: input.angle_note ?? "",
    ghlKeyword: (input.ghl_keyword ?? demoBySlug(demoSlug)?.defaultKeyword ?? "DEMO").toUpperCase(),
    createdBy: by,
    createdAt: new Date().toISOString(),
  }
  state.ideas = [idea, ...state.ideas].slice(0, 200)
  await save(state)
  return idea
}

/** Turn a backlog idea into a drafted slot on a day; the idea leaves the backlog. */
export async function promoteIdeaToSlot(ideaId: string, day: DayOfWeek, by: string) {
  if (CADENCE_MATRIX[day].restDay) throw new ContentError(409, "Saturday is a rest day. Pick another day.")
  const state = await getContentState()
  const idea = state.ideas.find((i) => i.id === ideaId)
  if (!idea) throw new ContentError(404, "No idea with that id.")
  const r = await upsertContentItem(
    { day_of_week: day, format: idea.format, title: idea.title, demo_slug: idea.demoSlug, top_pill_hook: idea.topPillHook || idea.title, ghl_keyword: idea.ghlKeyword, status: "drafted", shot_list: idea.angleNote ? [idea.angleNote] : [] },
    by
  )
  const after = await getContentState()
  after.ideas = after.ideas.filter((i) => i.id !== ideaId)
  await save(after)
  return r
}

// ── Claude ──────────────────────────────────────────────────────────────────

const PLAYBOOK = `You write Instagram content for Gates Technologies, a Georgia studio that builds custom scroll-driven websites with missed-call text-back, review requests and booking built in.
Formats: Reels are 12-second iPhone 9:16 shots of a hand scrolling a monitor (beats at 0-3s hero stop, 3-7s scroll pulls, 7-12s payoff) with a black "top pill" hook at the top. Carousels are 4-5 slides ending in a comment CTA. Stories are a share or a sticker (poll, question, link).
Every Reel and Carousel ends with a one-word comment keyword that triggers a GoHighLevel auto-DM.
Rules: plain American English. No em dashes or en dashes. Never invent statistics, percentages, reviews, view counts or client results; only use the demo facts given. Never quote Gates Technologies prices. Hooks under 80 characters.`

const SlotOut = z.object({
  id: z.string(),
  title: z.string(),
  topPillHook: z.string(),
  topPillAlt: z.string().optional(),
  shotList: z.array(z.string()).min(1).max(6),
  caption: z.string(),
  ghlKeyword: z.string(),
  ghlDmScript: z.string(),
})

const demoFacts = (slug: string) => {
  const d = demoBySlug(slug)
  return d ? `${d.businessName} (${d.vertical}, ${d.city}). Hero: ${d.heroStyle}. Facts: ${d.keyProofPoints.join("; ")}. Keyword: ${d.defaultKeyword}.` : slug
}

async function askClaude(prompt: string, model: "haiku" | "sonnet", count: number) {
  if ((await claudeBudget()).status === "blocked") throw new ContentError(429, "Daily Claude budget reached. Try again after midnight ET.")
  const id = model === "haiku" ? LIGHT : OPS
  const started = Date.now()
  const r = await generateText({
    model: claude(id),
    system: PLAYBOOK,
    prompt,
    output: Output.object({ schema: z.object({ slots: z.array(SlotOut).min(1).max(count) }) }),
  })
  void recordUsage({ model: id, inputTokens: r.usage?.inputTokens, outputTokens: r.usage?.outputTokens, latencyMs: Date.now() - started, source: "automation" })
  return r.output.slots
}

function applyGenerated(state: ContentState, out: z.infer<typeof SlotOut>[], by: string) {
  const at = new Date().toISOString()
  const byId = new Map(out.map((o) => [o.id, o]))
  let changed = 0
  state.items = state.items.map((i) => {
    const o = byId.get(i.id)
    if (!o) return i
    changed++
    return {
      ...i,
      title: stripDashes(o.title),
      topPillHook: stripDashes(o.topPillHook),
      topPillAlt: o.topPillAlt ? stripDashes(o.topPillAlt) : i.topPillAlt,
      shotList: o.shotList.map(stripDashes),
      caption: stripDashes(o.caption),
      ghlKeyword: o.ghlKeyword.toUpperCase().replace(/[^A-Z]/g, "") || i.ghlKeyword,
      ghlDmScript: stripDashes(o.ghlDmScript),
      status: "drafted",
      createdBy: by,
      updatedAt: at,
      postedAt: null,
    }
  })
  return changed
}

export async function regenerateSlotWithClaude(id: string, opts: { custom_angle?: string; model?: "haiku" | "sonnet"; demo_slug?: string }, by: string) {
  const state = await getContentState()
  const slot = state.items.find((i) => i.id === id)
  if (!slot) throw new ContentError(404, `No content slot "${id}".`)
  const slug = opts.demo_slug ?? slot.demoSlug
  const prompt = `Rewrite this ${slot.format} for ${slot.dayOfWeek} (${slot.postingTimeEt}).
Demo: ${demoFacts(slug)}
Current hook: ${slot.topPillHook}
Current caption: ${slot.caption}
${opts.custom_angle ? `Angle: ${opts.custom_angle}\n` : ""}Return exactly one slot with id "${slot.id}".`
  const out = await askClaude(prompt, opts.model ?? "sonnet", 1)
  if (opts.demo_slug && opts.demo_slug !== slot.demoSlug) {
    const d = demoBySlug(opts.demo_slug)
    state.items = state.items.map((i) => (i.id === id ? { ...i, demoSlug: opts.demo_slug!, businessName: d?.businessName ?? i.businessName, siteUrl: d?.siteUrl ?? i.siteUrl } : i))
  }
  applyGenerated(state, out.filter((o) => o.id === id), by)
  await save(state)
  return { item: state.items.find((i) => i.id === id), regenerated: 1 }
}

export async function generateWeekWithClaude(opts: { mode?: GrowthMode; demo_slug?: string; custom_angle?: string; model?: "haiku" | "sonnet" }, by: string) {
  const state = await getContentState()
  const mode = opts.mode ?? state.mode
  const slots = DAYS.flatMap((d) => slotsFor(state, d, mode)).filter((s) => s.status !== "posted")
  if (!slots.length) return { regenerated: 0, mode }
  const demos = opts.demo_slug ? [opts.demo_slug] : DEMO_CATALOG.map((d) => d.slug)
  const prompt = `Refresh this week's ${mode.toUpperCase()} growth Instagram plan. Keep each slot's id, day and format; rewrite title, hooks, shot list, caption, keyword and DM script.
Demos to feature (spread them across the week):
${demos.map((s) => `- ${s}: ${demoFacts(s)}`).join("\n")}
${opts.custom_angle ? `Angle for the week: ${opts.custom_angle}\n` : ""}Slots:
${slots.map((s) => `- id ${s.id} · ${s.dayOfWeek} · ${s.format} · ${s.postingTimeEt} · current demo ${s.demoSlug}`).join("\n")}
Return one entry per slot id above.`
  const out = await askClaude(prompt, opts.model ?? "sonnet", slots.length)
  const regenerated = applyGenerated(state, out, by)
  await save(state)
  return { regenerated, mode }
}
