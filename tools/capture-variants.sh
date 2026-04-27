#!/usr/bin/env bash
# Headless Renoise screenshot capture for white-baseline diff variants.
#
# Per variant: inject SkinColors into temp config, launch Renoise (~1s),
# screenshot, kill. Restores original config when done.
#
# Usage: ./tools/capture-variants.sh [output-dir]

set -euo pipefail

OUTPUT_DIR="${1:-tools/screenshots}"
VARIANTS_DIR="tools/white-variants"
VIRTUAL_DISPLAY=":99"
REAL_CONFIG="$HOME/.config/Renoise/V3.5.4/Config.xml"
TEMP_CFG="/tmp/rns-capture-cfg/V3.5.4"
HOME_OVERRIDE="/tmp/rns-capture-home"

# ── Verify prereqs ──────────────────────
command -v Xvfb >/dev/null || { echo "Need Xvfb"; exit 1; }
command -v maim  >/dev/null || { echo "Need maim"; exit 1; }
command -v xdotool >/dev/null || { echo "Need xdotool"; exit 1; }
command -v python3 >/dev/null || { echo "Need python3"; exit 1; }

if [ ! -f "$REAL_CONFIG" ]; then
  echo "Renoise config not found: $REAL_CONFIG"
  exit 1
fi

# ── Setup temp config (copy from real) ──
rm -rf "$(dirname "$TEMP_CFG")" "$HOME_OVERRIDE"
mkdir -p "$TEMP_CFG" "$OUTPUT_DIR"
cp "$REAL_CONFIG" "$TEMP_CFG/Config.xml"
# Copy plugin cache so Renoise starts fast
for f in "$HOME/.config/Renoise/V3.5.4/"*.db; do
  cp "$f" "$TEMP_CFG/" 2>/dev/null || true
done
# Home override symlink
mkdir -p "$HOME_OVERRIDE/.config/Renoise"
ln -sf "$TEMP_CFG" "$HOME_OVERRIDE/.config/Renoise/V3.5.4"

# ── Kill leftovers, start Xvfb ──────────
DISPLAY="$VIRTUAL_DISPLAY" pkill -9 renoise 2>/dev/null || true
pkill -9 Xvfb 2>/dev/null || true
sleep 1
export DISPLAY="$VIRTUAL_DISPLAY"
Xvfb "$VIRTUAL_DISPLAY" -screen 0 1920x1080x24 &
XVFB_PID=$!
sleep 1
echo "🖥️  Xvfb up"

cleanup() {
  local code=$?
  echo ""
  echo "Cleaning up..."
  DISPLAY="$VIRTUAL_DISPLAY" pkill -9 renoise 2>/dev/null || true
  kill $XVFB_PID 2>/dev/null || true
  rm -rf "$(dirname "$TEMP_CFG")" "$HOME_OVERRIDE"
  exit $code
}
trap cleanup EXIT INT TERM

# ── Find variants ──────────────────────
readarray -t VARIANTS < <(ls -d "$VARIANTS_DIR"/[0-9][0-9]_* 2>/dev/null | sort)
TOTAL=${#VARIANTS[@]}
[ "$TOTAL" -eq 0 ] && { echo "No variants found"; exit 1; }
GOOD=0; BAD=0

echo "🎯 $TOTAL variants"
echo ""

# ── Capture loop ────────────────────────
for variant_dir in "${VARIANTS[@]}"; do
  XRNC=$(ls "$variant_dir"/*.xrnc 2>/dev/null | head -1)
  [ -z "$XRNC" ] && continue

  NAME=$(basename "$variant_dir" | sed 's/^[0-9]*_//')
  NUM=$((GOOD + BAD + 1))
  echo -n "[$NUM/$TOTAL] $NAME"

  # Restore clean config + plugin caches (Renoise overwrites them on exit)
  cp "$REAL_CONFIG" "$TEMP_CFG/Config.xml"
  for f in "$HOME/.config/Renoise/V3.5.4/"*.db; do
    cp -f "$f" "$TEMP_CFG/" 2>/dev/null || true
  done
  python3 -c "
import re
c = open('$TEMP_CFG/Config.xml').read()
c = re.sub(r'<RescanPreviouslyFailedPlugs>.*</RescanPreviouslyFailedPlugs>', '<RescanPreviouslyFailedPlugs>false</RescanPreviouslyFailedPlugs>', c)
c = re.sub(r'<ScanForNewPluginsOnStartup>.*</ScanForNewPluginsOnStartup>', '<ScanForNewPluginsOnStartup>false</ScanForNewPluginsOnStartup>', c)
c = re.sub(r'<AutoRescanHotPluggedDevices>.*</AutoRescanHotPluggedDevices>', '<AutoRescanHotPluggedDevices>false</AutoRescanHotPluggedDevices>', c)
c = re.sub(r'<WindowedModeSize>.*</WindowedModeSize>', '<WindowedModeSize>1920,1080</WindowedModeSize>', c)
c = re.sub(r'<WindowedModeIsMaximized>.*</WindowedModeIsMaximized>', '<WindowedModeIsMaximized>true</WindowedModeIsMaximized>', c)
c = re.sub(r'<ShowWelcomeDialog>.*</ShowWelcomeDialog>', '<ShowWelcomeDialog>false</ShowWelcomeDialog>', c)
# Load the test song so all UI elements (pattern data, devices, automation) are visible
SONG_PATH = '/home/meneses/vibe-coding-sandbox/renoise-themes/tools/DemoSong - Hunz - Soon Soon.xrns'
if '<LastSong>' in c:
    c = re.sub(r'<LastSong>.*</LastSong>', '<LastSong>' + SONG_PATH + '</LastSong>', c)
else:
    # Add LastSong before the closing </RenoiseConfig> or near RecentFiles
    c = c.replace('</RecentLoadedFiles>', '</RecentLoadedFiles>\n    <LastSong>' + SONG_PATH + '</LastSong>')
sk = open('$XRNC').read()
ss = sk.find('<SkinColors'); se = sk.find('</SkinColors>') + len('</SkinColors>')
c = re.sub(r'(<!--Skin Colors-->.*?</SkinColors>)', '<!--Skin Colors-->\n  ' + sk[ss:se] + '\n  ', c, count=1, flags=re.DOTALL)
open('$TEMP_CFG/Config.xml','w').write(c)
" 2>&1 || { echo " ✗ config"; BAD=$((BAD+1)); continue; }

  if ! grep -q '<SkinColors' "$TEMP_CFG/Config.xml"; then
    echo " ✗ config injection failed"
    BAD=$((BAD+1))
    continue
  fi

  # Launch Renoise with the demo song loaded as positional arg
  SONG_PATH="/home/meneses/vibe-coding-sandbox/renoise-themes/tools/DemoSong - Hunz - Soon Soon.xrns"
  DISPLAY="$VIRTUAL_DISPLAY" HOME="$HOME_OVERRIDE" renoise "$SONG_PATH" &
  RPID=$!

  # Wait for main window (30s timeout)
  W=""
  for i in $(seq 1 30); do
    sleep 0.5
    W=$(DISPLAY="$VIRTUAL_DISPLAY" xdotool search --name "Renoise" 2>/dev/null | head -1 || true)
    [ -z "$W" ] && continue
    SW=$(DISPLAY="$VIRTUAL_DISPLAY" xdotool getwindowgeometry "$W" 2>/dev/null | grep -oP '\d+(?=x)' | head -1 || echo 0)
    [ "${SW:-0}" -gt 800 ] && break
  done

  if [ -z "$W" ] || [ "${SW:-0}" -le 800 ]; then
    echo " ✗ timeout"
    kill $RPID 2>/dev/null || true
    sleep 1
    BAD=$((BAD+1))
    continue
  fi

  sleep 2  # Let UI paint

  # Screenshot
  OUT="$OUTPUT_DIR/${NAME}.png"
  DISPLAY="$VIRTUAL_DISPLAY" maim -i "$W" "$OUT" 2>/dev/null || true
  FS=$(stat -c%s "$OUT" 2>/dev/null || echo 0)

  if [ "$FS" -gt 10000 ]; then
    echo " ✓"
    GOOD=$((GOOD+1))
  else
    echo " ✗ small"
    BAD=$((BAD+1))
  fi

  # Hard kill for speed (prevents slow JACK teardown causing next-launch conflicts)
  kill -9 $RPID 2>/dev/null || true
  wait $RPID 2>/dev/null || true
  sleep 0.5
done

echo ""
echo "✅ $GOOD/$TOTAL captured   ❌ $BAD failed"
echo "📸 $OUTPUT_DIR/"
