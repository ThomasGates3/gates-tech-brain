#!/usr/bin/env bash
# Turn a downloaded Higgsfield (or HeyGen) render into web-ready files in assets/.
#
#   scripts/prepare-video.sh <input.mp4> [name] [--loop] [--mobile] [--keep-audio]
#
#   name          output base name (default: hero) → assets/<name>.mp4, .webm, -poster.jpg
#   --loop        crossfade the tail into the head so the background loop has no jump cut
#   --mobile      also write assets/<name>-mobile.mp4, a centre-cropped 9:16 cut
#   --keep-audio  keep the soundtrack (HeyGen spokesperson videos); default strips it
#
# Needs ffmpeg + ffprobe on PATH. Run from the site folder (the one with index.html).
set -euo pipefail

in="${1:?usage: prepare-video.sh <input.mp4> [name] [--loop] [--mobile] [--keep-audio]}"; shift
name="hero"; loop=0; mobile=0; audio=0
for a in "$@"; do
  case "$a" in
    --loop) loop=1 ;; --mobile) mobile=1 ;; --keep-audio) audio=1 ;;
    -*) echo "unknown flag $a" >&2; exit 2 ;;
    *) name="$a" ;;
  esac
done

out="assets"; mkdir -p "$out"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
src="$in"

if [ "$loop" = 1 ]; then
  # Output starts at frame F and ends on a crossfade back into frame F: seamless.
  dur="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in")"
  fade="0.8"
  offset="$(awk -v d="$dur" -v f="$fade" 'BEGIN{printf "%.3f", d-2*f}')"
  ffmpeg -v error -y -i "$in" -filter_complex \
    "[0:v]fps=30,format=yuv420p,split[a][b];[a]trim=start=${fade}:end=${dur},setpts=PTS-STARTPTS[body];[b]trim=0:${fade},setpts=PTS-STARTPTS[head];[body][head]xfade=transition=fade:duration=${fade}:offset=${offset}[v]" \
    -map "[v]" -an -c:v libx264 -crf 16 -preset slow "$tmp/loop.mp4"
  src="$tmp/loop.mp4"
fi

aflags=(-an)
[ "$audio" = 1 ] && aflags=(-c:a aac -b:a 128k)

# H.264 mp4: plays everywhere; faststart so it starts before the whole file loads.
ffmpeg -v error -y -i "$src" -vf "scale='min(1920,iw)':-2,fps=30,format=yuv420p" \
  -c:v libx264 -profile:v high -crf 23 -preset slow -movflags +faststart "${aflags[@]}" "$out/$name.mp4"

# VP9 webm fallback.
waflags=(-an)
[ "$audio" = 1 ] && waflags=(-c:a libopus -b:a 96k)
ffmpeg -v error -y -i "$src" -vf "scale='min(1920,iw)':-2,fps=30" \
  -c:v libvpx-vp9 -crf 34 -b:v 0 -row-mt 1 "${waflags[@]}" "$out/$name.webm"

# Poster = first frame, so the page looks identical before the video starts.
ffmpeg -v error -y -i "$out/$name.mp4" -frames:v 1 -q:v 3 "$out/$name-poster.jpg"

if [ "$mobile" = 1 ]; then
  ffmpeg -v error -y -i "$out/$name.mp4" -vf "crop='min(iw,ih*9/16)':ih,scale=720:-2,format=yuv420p" \
    -c:v libx264 -crf 24 -preset slow -movflags +faststart "${aflags[@]}" "$out/$name-mobile.mp4"
fi

ls -lh "$out/$name"*
