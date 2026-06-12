#!/bin/sh
# Fallback store screenshot: the real pipeline against the sandbox feed,
# 1280×800 at dpr=2 (downscaled back to 1280×800), hole at mass 0.6
# mid-feed. A capture/recording of the real x.com feed is PREFERRED for
# the listing — see PUBLISH-CHECKLIST.md ("Human must do").
set -e
cd "$(dirname "$0")/.."
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
npx esbuild test/integration-entry.ts --bundle --format=iife --global-name=EH \
  --outfile=test/.integration.bundle.js --log-level=warning
"$CHROME" --headless --disable-gpu --force-device-scale-factor=2 \
  --window-size=1280,800 --timeout=6000 \
  --screenshot=store-screenshot.png \
  "file://$PWD/test/integration-sandbox.html?m=0.6&stall=1&force=lens&clean=1" 2>/dev/null
sips -z 800 1280 store-screenshot.png >/dev/null
echo "wrote store-screenshot.png (1280x800)"
