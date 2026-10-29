# Gates client site template

One static `index.html` + `assets/`. Tailwind, GSAP and ScrollTrigger load from CDN, so there's no build step: push the folder to a repo and import it in Vercel (Framework preset: **Other**, no build command, output directory `.`).

The Brain returns this file as `site_template` from `brain_website_brief`, along with `media` (the Higgsfield and HeyGen brief for that lead).

## Per client: edit only these

1. The `window.SITE` block at the top of `index.html`: brand, phone, colors, fonts, all copy, estimator prices, video paths.
2. `<title>`, meta description and `og:*` tags in `<head>` (crawlers read them before `SITE` renders).
3. Files in `assets/`. Replace the `placeholder-*.svg` images with real photos and update their paths in `SITE`.

Everything below the `RENDER + MOTION` comment is shared code. Don't edit it per client.

## Hero B-roll (Higgsfield)

Run the shots from the brief's `media.higgsfield` with the Higgsfield connector. Every prompt carries the house style: Architectural Digest look, golden hour, deep dynamic range, shallow depth of field, one slow continuous camera move. Then:

```bash
# from the site folder; needs ffmpeg
mkdir -p assets/raw   # put the downloaded render at assets/raw/hero.mp4
scripts/prepare-video.sh assets/raw/hero.mp4 hero --loop --mobile
```

That writes the files `SITE.hero.video` already points at:

| File | What |
| --- | --- |
| `assets/hero.mp4` | H.264, ≤1080p, muted, faststart (plays everywhere) |
| `assets/hero.webm` | VP9 fallback |
| `assets/hero-poster.jpg` | first frame, shown before the video starts and with reduced motion |
| `assets/hero-mobile.mp4` | centre-cropped 9:16 cut for phones (`--mobile`) |

`--loop` crossfades the last 0.8s into the start so the loop has no jump cut. Delete `assets/raw/` before deploying (or keep it out of git) so the large source files aren't shipped.

## Spokesperson (HeyGen, optional)

Use the brief's `media.heygen` (owner avatar ID or a preset spokesperson, a 30–60s script, captions on). Download the MP4 and the `.vtt`, then:

```bash
scripts/prepare-video.sh assets/raw/spokesperson.mp4 spokesperson --keep-audio
cp ~/Downloads/captions.vtt assets/spokesperson.vtt
```

In `SITE.spokesperson`: `enabled: true`, `captions: "assets/spokesperson.vtt"`, and `orientation: "portrait"` for 9:16 restaurant promos. A "Watch" button appears in the hero and opens the video in a modal. With `enabled: false`, nothing shows.

## Lead form

`SITE.estimator.formAction` takes any endpoint that accepts a form POST (Formspree, Basin, your own API). If it's empty, the form just thanks the visitor and shows the tap-to-call number.
