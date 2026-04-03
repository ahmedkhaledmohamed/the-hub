#!/bin/bash
export NODE_ENV=production
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "$(dirname "$0")"
exec /opt/homebrew/bin/node server.mjs
