#!/bin/bash
# Starts the-hub in production mode.
# Used by macOS LaunchAgent for always-on operation.

cd "$(dirname "$0")"

# Build if .next doesn't exist or is older than source
if [ ! -d ".next" ] || [ "$(find src hub.config.ts -newer .next/BUILD_ID -print -quit 2>/dev/null)" ]; then
  /opt/homebrew/bin/npm run build 2>&1
fi

exec /opt/homebrew/bin/node node_modules/.bin/next start -p 9001
