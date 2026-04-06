#!/usr/bin/env node

/**
 * The Hub — npx entry point.
 *
 * Usage:
 *   npx the-hub          Start The Hub (builds on first run)
 *   npx the-hub --port   Override HTTP port (default: 9002)
 */

import { execSync, spawn } from "node:child_process";
import { existsSync, copyFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const args = process.argv.slice(2);
const portArg = args.find((a) => a.startsWith("--port="));
const port = portArg ? portArg.split("=")[1] : process.env.HTTP_PORT || "9002";

// ── Check Node version ──
const [major] = process.versions.node.split(".").map(Number);
if (major < 18) {
  console.error(`\n  Error: The Hub requires Node.js >= 18 (you have ${process.version})\n`);
  process.exit(1);
}

// ── Ensure hub.config.ts exists ──
const configPath = join(ROOT, "hub.config.ts");
const examplePath = join(ROOT, "hub.config.example.ts");

if (!existsSync(configPath)) {
  if (existsSync(examplePath)) {
    copyFileSync(examplePath, configPath);
    console.log(`\n  Created hub.config.ts from example.`);
    console.log(`  Edit it to add your workspace paths, then run again.\n`);
    console.log(`  File: ${configPath}\n`);
    process.exit(0);
  } else {
    console.error(`\n  Error: No hub.config.ts or hub.config.example.ts found.\n`);
    process.exit(1);
  }
}

// ── Build if needed ──
const buildId = join(ROOT, ".next", "BUILD_ID");
const needsBuild = !existsSync(buildId) || (
  statSync(configPath).mtimeMs > statSync(buildId).mtimeMs
);

if (needsBuild) {
  console.log(`\n  Building The Hub... (this takes ~30s on first run)\n`);
  try {
    execSync("npm run build", { cwd: ROOT, stdio: "inherit" });
  } catch {
    console.error(`\n  Build failed. Check the output above for errors.\n`);
    process.exit(1);
  }
}

// ── Start server ──
console.log(`\n  Starting The Hub on http://localhost:${port}...\n`);

const server = spawn("node", ["server.mjs"], {
  cwd: ROOT,
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production", HTTP_PORT: port },
});

server.on("close", (code) => process.exit(code || 0));

// Open browser after a short delay
setTimeout(() => {
  const url = `http://localhost:${port}`;
  try {
    const cmd = process.platform === "darwin" ? "open" : "xdg-open";
    execSync(`${cmd} ${url}`, { stdio: "ignore" });
  } catch {
    // Browser open failed silently — user can navigate manually
  }
}, 2000);
