#!/bin/bash
set -e

HUB_DIR="$(cd "$(dirname "$0")" && pwd)"
HUB_NAME="the-hub"
HTTPS_PORT="${PORT:-9001}"
HTTP_PORT="${HTTP_PORT:-9002}"
HOSTNAME="${HUB_HOSTNAME:-my-hub}"
NODE="$(command -v node)"
NPM="$(command -v npm)"

green()  { printf "\033[32m%s\033[0m\n" "$1"; }
yellow() { printf "\033[33m%s\033[0m\n" "$1"; }
dim()    { printf "\033[2m%s\033[0m\n" "$1"; }
bold()   { printf "\033[1m%s\033[0m\n" "$1"; }

bold "┌─────────────────────────────────┐"
bold "│  The Hub — Setup                │"
bold "└─────────────────────────────────┘"
echo ""

# 1. Check prerequisites
if [ -z "$NODE" ]; then
  echo "❌ Node.js not found. Install it: https://nodejs.org"
  exit 1
fi
NODE_VERSION=$("$NODE" --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "❌ Node.js 18+ required (found $("$NODE" --version))"
  exit 1
fi
green "✓ Node.js $("$NODE" --version)"

# 2. Install dependencies
if [ ! -d "$HUB_DIR/node_modules" ]; then
  echo "→ Installing dependencies..."
  "$NPM" install --prefix "$HUB_DIR" 2>&1 | tail -1
fi
green "✓ Dependencies installed"

# 3. Create config if missing
if [ ! -f "$HUB_DIR/hub.config.ts" ]; then
  cp "$HUB_DIR/hub.config.example.ts" "$HUB_DIR/hub.config.ts"
  yellow "→ Created hub.config.ts from example — edit it with your workspace paths"
else
  green "✓ hub.config.ts exists"
fi

# 4. Build
echo "→ Building..."
"$NPM" run build --prefix "$HUB_DIR" 2>&1 | grep -E "(✓|Route|Error)" | head -5
green "✓ Built"

# 5. Optional: HTTPS with mkcert
echo ""
read -p "Set up HTTPS with a local hostname? (y/N) " SETUP_HTTPS
if [[ "$SETUP_HTTPS" =~ ^[Yy]$ ]]; then
  if ! command -v mkcert &>/dev/null; then
    echo "→ Installing mkcert..."
    brew install mkcert 2>/dev/null || { echo "Install mkcert manually: brew install mkcert"; }
  fi
  mkcert -install 2>/dev/null
  mkdir -p "$HUB_DIR/certs"
  cd "$HUB_DIR/certs"
  mkcert "$HOSTNAME" localhost 127.0.0.1
  cd "$HUB_DIR"
  green "✓ HTTPS certificates created"

  if ! grep -q "$HOSTNAME" /etc/hosts 2>/dev/null; then
    echo "→ Adding $HOSTNAME to /etc/hosts (requires sudo)..."
    echo "127.0.0.1 $HOSTNAME" | sudo tee -a /etc/hosts >/dev/null
    sudo dscacheutil -flushcache 2>/dev/null
    green "✓ $HOSTNAME → localhost"
  fi
fi

# 6. Create start.sh
cat > "$HUB_DIR/start.sh" <<STARTEOF
#!/bin/bash
export NODE_ENV=production
export PATH="$(dirname "$NODE"):\$PATH"
cd "$HUB_DIR"
exec "$NODE" server.mjs
STARTEOF
chmod +x "$HUB_DIR/start.sh"
green "✓ start.sh created"

# 7. Optional: LaunchAgent (macOS always-on)
echo ""
read -p "Install LaunchAgent to start hub at login? (y/N) " SETUP_AGENT
if [[ "$SETUP_AGENT" =~ ^[Yy]$ ]]; then
  PLIST="$HOME/Library/LaunchAgents/com.hub.the-hub.plist"
  cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.hub.the-hub</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$HUB_DIR/start.sh</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$HUB_DIR</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$HOME/.the-hub.log</string>
    <key>StandardErrorPath</key>
    <string>$HOME/.the-hub.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>$(dirname "$NODE"):/usr/local/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>$HOME</string>
    </dict>
</dict>
</plist>
PLISTEOF
  launchctl unload "$PLIST" 2>/dev/null
  launchctl load "$PLIST"
  green "✓ LaunchAgent installed — hub starts at login"
fi

# 8. Optional: Cursor extension
echo ""
read -p "Install Cursor extension? (y/N) " SETUP_EXT
if [[ "$SETUP_EXT" =~ ^[Yy]$ ]]; then
  cd "$HUB_DIR/extension"
  "$NPM" install 2>&1 | tail -1
  "$NPM" run build 2>&1
  npx @vscode/vsce package --no-dependencies 2>&1 | grep -E "(DONE|Error)"
  if command -v cursor &>/dev/null; then
    cursor --install-extension the-hub-0.1.0.vsix --force 2>&1
    green "✓ Cursor extension installed — reload Cursor to activate"
  else
    yellow "→ VSIX built at extension/the-hub-0.1.0.vsix — install manually"
  fi
  cd "$HUB_DIR"
fi

# Done
echo ""
bold "┌─────────────────────────────────┐"
bold "│  Setup complete!                │"
bold "└─────────────────────────────────┘"
echo ""
echo "  Start:   npm start"
echo "  Dev:     npm run dev"
echo "  HTTP:    http://localhost:$HTTP_PORT"
if [[ "$SETUP_HTTPS" =~ ^[Yy]$ ]]; then
  echo "  HTTPS:   https://$HOSTNAME:$HTTPS_PORT"
fi
echo "  Cursor:  Cmd+Shift+H"
echo ""
dim "  Edit hub.config.ts to customize your workspace."
echo ""
