#!/usr/bin/env bash
# CI only (release workflow, Linux): start the built AppImage on a virtual display and check that the
# MAIN window (1300 x 800, shown only after the splash and once the UI is drawn) appears and stays open.
# Saves screenshots and the app log to smoke/.  Needs: Xvfb, xdotool, imagemagick.
# Usage: bash scripts/linux-smoke-test.sh release/Eqo-Partitura-x86_64.AppImage
set -u
APPIMAGE="$(readlink -f "$1")"
mkdir -p smoke
export DISPLAY=:99
Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp &
XVFB=$!
sleep 2

# GitHub runners have no FUSE: let the AppImage unpack itself instead of mounting (same AppRun, same app).
export APPIMAGE_EXTRACT_AND_RUN=1
export HOME="$(mktemp -d)"   # clean profile, as on a first start
"$APPIMAGE" > smoke/app.log 2>&1 &
APP=$!

# visible (mapped) windows only — the main window exists hidden from the start and is shown when ready
visible() { xdotool search --onlyvisible --name 'Partitura|echo:' 2>/dev/null || true; }
main_open() {
  for w in $(visible); do
    g=$(xdotool getwindowgeometry "$w" 2>/dev/null | awk '/Geometry/{print $2}')
    [ -n "$g" ] && [ "${g%x*}" -ge 1000 ] && return 0   # 1000+ px wide = main window (the splash is 560)
  done
  return 1
}

ok=0
for i in $(seq 1 60); do
  sleep 1
  if ! kill -0 "$APP" 2>/dev/null; then echo "[smoke] the app exited after ${i}s"; break; fi
  [ "$i" = 2 ] && import -window root smoke/1-start.png 2>/dev/null
  if main_open; then ok=1; echo "[smoke] main window visible after ${i}s"; break; fi
done

if [ "$ok" = 1 ]; then
  sleep 8   # stays open, splash closed, UI drawn
  import -window root smoke/2-main.png 2>/dev/null
  kill -0 "$APP" 2>/dev/null || { echo "[smoke] the app closed after opening"; ok=0; }
fi

echo "[smoke] visible windows:"
for w in $(visible); do echo "  $(xdotool getwindowname "$w") $(xdotool getwindowgeometry "$w" | awk '/Geometry/{print $2}')"; done
if pgrep -af "partitura" | grep -q -- "--no-sandbox"; then
  echo "[smoke] started with --no-sandbox (this system blocks unprivileged user namespaces)"
else
  echo "[smoke] started with Chromium's sandbox"
fi
echo "[smoke] app log (last 40 lines):"; tail -n 40 smoke/app.log

pkill -f "partitura" 2>/dev/null; kill "$APP" 2>/dev/null; kill "$XVFB" 2>/dev/null
if [ "$ok" = 1 ]; then echo "[smoke] OK"; exit 0; fi
echo "[smoke] FAILED: the main window did not appear"; exit 1
