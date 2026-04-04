#!/usr/bin/env node

/**
 * The Hub CLI — thin HTTP client calling the running Hub server.
 *
 * Usage:
 *   hub search <query>              Search artifacts by keyword
 *   hub open [tab]                  Open a tab in the browser (default: briefing)
 *   hub status                      Show artifact/group counts and staleness
 *   hub context compile --group <id>  Compile context for a group
 *   hub help                        Show this help message
 *
 * Environment:
 *   HUB_URL   Base URL of the Hub server (default: http://localhost:9002)
 */

const HUB_URL = process.env.HUB_URL || "http://localhost:9002";

const [,, command, ...args] = process.argv;

async function fetchJson(path, options) {
  const url = `${HUB_URL}${path}`;
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      console.error(`Error: ${res.status} ${res.statusText}`);
      process.exit(1);
    }
    return await res.json();
  } catch (err) {
    console.error(`Could not connect to Hub at ${HUB_URL}`);
    console.error("Make sure the server is running: npm start");
    process.exit(1);
  }
}

// ── Commands ───────────────────────────────────────────────────────

async function search(query) {
  if (!query) {
    console.error("Usage: hub search <query>");
    process.exit(1);
  }

  const data = await fetchJson(`/api/search?q=${encodeURIComponent(query)}&limit=20`);

  if (data.results.length === 0) {
    console.log(`No results for "${query}".`);
    return;
  }

  console.log(`\n  ${data.results.length} result(s) for "${query}":\n`);
  for (const r of data.results) {
    const snippet = r.snippet
      ? r.snippet.replace(/<\/?mark>/g, "").slice(0, 80)
      : "";
    console.log(`  ${r.title}`);
    console.log(`  ${dim(r.path)}`);
    if (snippet) console.log(`  ${dim(snippet)}`);
    console.log("");
  }
}

async function open(tab) {
  const target = tab || "briefing";
  const url = target === "briefing" || target === "repos" || target === "hygiene"
    ? `${HUB_URL}/${target}`
    : `${HUB_URL}/${target}`;

  // Try to open in default browser
  const { exec } = require("child_process");
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  exec(`${cmd} "${url}"`);
  console.log(`Opening ${url}`);
}

async function status() {
  const data = await fetchJson("/api/manifest");
  const artifacts = data.artifacts || [];
  const groups = data.groups || [];

  const fresh = artifacts.filter((a) => a.staleDays <= 7).length;
  const aging = artifacts.filter((a) => a.staleDays > 7 && a.staleDays <= 30).length;
  const stale = artifacts.filter((a) => a.staleDays > 30).length;

  console.log(`\n  The Hub — Status\n`);
  console.log(`  Artifacts:  ${artifacts.length}`);
  console.log(`  Groups:     ${groups.length}`);
  console.log(`  Workspaces: ${data.workspaces?.length || 0}`);
  console.log(`  Scanned:    ${data.generatedAt ? new Date(data.generatedAt).toLocaleString() : "never"}`);
  console.log("");
  console.log(`  Fresh (≤7d):   ${green(String(fresh))}`);
  console.log(`  Aging (8-30d): ${yellow(String(aging))}`);
  console.log(`  Stale (>30d):  ${red(String(stale))}`);
  console.log("");

  if (groups.length > 0) {
    console.log("  Groups:");
    for (const g of groups) {
      console.log(`    ${g.label}: ${g.count} artifact(s)`);
    }
    console.log("");
  }
}

async function compileContext() {
  const groupIdx = args.indexOf("--group");
  if (groupIdx === -1 || !args[groupIdx + 1]) {
    console.error("Usage: hub context compile --group <group-id>");
    process.exit(1);
  }
  const groupId = args[groupIdx + 1];

  // Fetch manifest to get artifact paths for the group
  const manifest = await fetchJson("/api/manifest");
  const paths = manifest.artifacts
    .filter((a) => a.group === groupId)
    .map((a) => a.path);

  if (paths.length === 0) {
    console.error(`No artifacts found in group "${groupId}".`);
    console.error(`Available groups: ${manifest.groups.map((g) => g.id).join(", ")}`);
    process.exit(1);
  }

  const data = await fetchJson("/api/compile-context", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths }),
  });

  console.log(data.compiled);
}

async function pluginCmd() {
  const sub = args[0];
  if (sub === "install" && args[1]) {
    const data = await fetchJson("/api/marketplace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "install", name: args[1] }),
    });
    if (data.success) {
      console.log(`\n  ${green("✓")} ${data.message}\n`);
    } else {
      console.error(`\n  ${red("✗")} ${data.message}\n`);
      process.exit(1);
    }
  } else if (sub === "uninstall" && args[1]) {
    const data = await fetchJson("/api/marketplace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "uninstall", name: args[1] }),
    });
    if (data.success) {
      console.log(`\n  ${green("✓")} ${data.message}\n`);
    } else {
      console.error(`\n  ${red("✗")} ${data.message}\n`);
    }
  } else if (sub === "list") {
    const data = await fetchJson("/api/marketplace");
    console.log(`\n  Plugin Marketplace (${data.plugins?.length || 0} plugins)\n`);
    for (const p of data.plugins || []) {
      const status = p.installed ? green("installed") : dim("available");
      console.log(`  ${p.displayName} (${p.name}) — ${status}`);
      console.log(`  ${dim(p.description)}\n`);
    }
  } else {
    console.log(`
  Plugin commands:
    hub plugin list                    Browse available plugins
    hub plugin install <name|url>      Install a plugin
    hub plugin uninstall <name>        Remove a plugin
`);
  }
}

function help() {
  console.log(`
  The Hub CLI

  Commands:
    hub search <query>                Search artifacts by keyword
    hub open [tab]                    Open a tab in the browser
    hub status                        Show workspace status
    hub context compile --group <id>  Compile context for a group
    hub plugin list                   Browse available plugins
    hub plugin install <name>         Install a plugin
    hub help                          Show this help

  Environment:
    HUB_URL   Server URL (default: http://localhost:9002)
`);
}

// ── Color helpers ──────────────────────────────────────────────────

function dim(s) { return `\x1b[2m${s}\x1b[0m`; }
function green(s) { return `\x1b[32m${s}\x1b[0m`; }
function yellow(s) { return `\x1b[33m${s}\x1b[0m`; }
function red(s) { return `\x1b[31m${s}\x1b[0m`; }

// ── Router ─────────────────────────────────────────────────────────

async function main() {
  switch (command) {
    case "search":
      await search(args.join(" "));
      break;
    case "open":
      await open(args[0]);
      break;
    case "status":
      await status();
      break;
    case "context":
      if (args[0] === "compile") {
        args.shift();
        await compileContext();
      } else {
        help();
      }
      break;
    case "plugin":
      args.shift();
      await pluginCmd();
      break;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      help();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      help();
      process.exit(1);
  }
}

main();
