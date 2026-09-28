#!/usr/bin/env bash
# Re-encode an episode so it seeks reliably in mobile browsers:
#  - moov atom at the front (+faststart) so seeking works before the whole
#    file has downloaded
#  - a keyframe every ~2s (-g 48 at 24fps) so any seek decodes from a nearby
#    keyframe instead of scanning back through a long GOP
# Usage: scripts/optimize-video.sh input.mp4 output.mp4
set -euo pipefail
ffmpeg -i "$1" \
  -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p \
  -g 48 -keyint_min 48 -sc_threshold 0 \
  -c:a aac -b:a 128k \
  -movflags +faststart \
  "$2"
