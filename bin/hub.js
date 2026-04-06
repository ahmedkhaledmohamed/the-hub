#!/usr/bin/env node

/**
 * The Hub CLI — thin HTTP client calling the running Hub server.
 *
 * Usage:
 *   hub search <query>                Search artifacts (with impact scores)
 *   hub context <topic>               Get smart context for a topic
 *   hub stale                         Show stale docs needing attention
 *   hub status                        Show workspace status
 *   hub open [tab]                    Open a tab in the browser
 *   hub help                          Show this help message
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

  // Fetch impact scores for results
  let impactMap = {};
  try {
    const manifest = await fetchJson("/api/manifest");
    const artifacts = manifest.artifacts || [];
    for (const r of data.results) {
      const a = artifacts.find((art) => art.path === r.path);
      if (a) impactMap[r.path] = a.staleDays;
    }
  } catch { /* non-critical */ }

  console.log(`\n  ${data.results.length} result(s) for "${query}":\n`);
  for (const r of data.results) {
    const snippet = r.snippet
      ? r.snippet.replace(/<\/?mark>/g, "").slice(0, 80)
      : "";
    const staleDays = impactMap[r.path];
    const age = staleDays !== undefined
      ? staleDays <= 7 ? green(`${staleDays}d`) : staleDays <= 30 ? yellow(`${staleDays}d`) : red(`${staleDays}d`)
      : "";
    console.log(`  ${r.title} ${age ? `[${age}]` : ""}`);
    console.log(`  ${dim(r.path)}`);
    if (snippet) console.log(`  ${dim(snippet)}`);
    console.log("");
  }
}

async function context(topic) {
  if (!topic) {
    console.error("Usage: hub context <topic>");
    console.error("Example: hub context 'authentication architecture'");
    process.exit(1);
  }

  // Use the smart context API
  const data = await fetchJson(`/api/search?q=${encodeURIComponent(topic)}&limit=10`);
  const manifest = await fetchJson("/api/manifest");

  if (!data.results || data.results.length === 0) {
    console.log(`No context found for "${topic}".`);
    return;
  }

  console.log(`\n  ${bold("Context:")} ${topic}\n`);
  console.log(`  ${data.results.length} relevant document(s)\n`);

  for (const r of data.results.slice(0, 8)) {
    const a = (manifest.artifacts || []).find((art) => art.path === r.path);
    const staleDays = a?.staleDays || 0;
    const age = staleDays <= 7 ? green("fresh") : staleDays <= 30 ? yellow("aging") : red("stale");
    const group = a?.group || "unknown";

    console.log(`  ${bold(r.title)} [${age}] (${group})`);
    console.log(`  ${dim(r.path)}`);
    if (r.snippet) {
      const clean = r.snippet.replace(/<\/?mark>/g, "").slice(0, 120);
      console.log(`  ${dim(clean)}`);
    }
    console.log("");
  }

  // Show related decisions if any
  try {
    const decisions = await fetchJson("/api/decisions");
    if (decisions.decisions && decisions.decisions.length > 0) {
      const keywords = topic.toLowerCase().split(/\s+/);
      const related = decisions.decisions.filter((d) =>
        keywords.some((k) => d.summary.toLowerCase().includes(k))
      ).slice(0, 3);

      if (related.length > 0) {
        console.log(`  ${bold("Related Decisions:")}\n`);
        for (const d of related) {
          console.log(`  ${dim("•")} ${d.summary}`);
          console.log(`    ${dim(d.artifactPath)}`);
        }
        console.log("");
      }
    }
  } catch { /* non-critical */ }
}

async function stale() {
  const data = await fetchJson("/api/manifest");
  const artifacts = data.artifacts || [];

  const staleArtifacts = artifacts
    .filter((a) => a.staleDays > 90)
    .sort((a, b) => b.staleDays - a.staleDays);

  if (staleArtifacts.length === 0) {
    console.log("\n  No stale documents (>90 days). Workspace is healthy.\n");
    return;
  }

  console.log(`\n  ${bold(`${staleArtifacts.length} stale document(s)`)} (>90 days)\n`);

  for (const a of staleArtifacts.slice(0, 20)) {
    const color = a.staleDays > 180 ? red : yellow;
    console.log(`  ${color(`${a.staleDays}d`)}  ${a.title}`);
    console.log(`  ${dim(`    ${a.path} (${a.group})`)}`);
  }

  if (staleArtifacts.length > 20) {
    console.log(`\n  ${dim(`... and ${staleArtifacts.length - 20} more`)}`);
  }

  // Show hygiene issues if any
  try {
    const hygiene = await fetchJson("/api/hygiene");
    if (hygiene.findings && hygiene.findings.length > 0) {
      const highCount = hygiene.findings.filter((f) => f.severity === "high").length;
      if (highCount > 0) {
        console.log(`\n  ${red(`${highCount} high-severity hygiene issue(s)`)} — run ${bold("hub open hygiene")} to review`);
      }
    }
  } catch { /* non-critical */ }

  console.log("");
}

async function open(tab) {
  const target = tab || "briefing";
  const url = `${HUB_URL}/${target}`;
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
  const staleCount = artifacts.filter((a) => a.staleDays > 30).length;
  const freshPct = artifacts.length > 0 ? Math.round((fresh / artifacts.length) * 100) : 0;

  console.log(`\n  ${bold("The Hub — Status")}\n`);
  console.log(`  Artifacts:  ${artifacts.length}`);
  console.log(`  Groups:     ${groups.length}`);
  console.log(`  Workspaces: ${data.workspaces?.length || 0}`);
  console.log(`  Scanned:    ${data.generatedAt ? new Date(data.generatedAt).toLocaleString() : "never"}`);
  console.log(`  Freshness:  ${freshPct > 70 ? green(`${freshPct}%`) : freshPct > 40 ? yellow(`${freshPct}%`) : red(`${freshPct}%`)}`);
  console.log("");
  console.log(`  Fresh (≤7d):   ${green(String(fresh))}`);
  console.log(`  Aging (8-30d): ${yellow(String(aging))}`);
  console.log(`  Stale (>30d):  ${red(String(staleCount))}`);
  console.log("");

  if (groups.length > 0) {
    console.log("  Groups:");
    for (const g of groups) {
      console.log(`    ${g.label}: ${g.count} artifact(s)`);
    }
    console.log("");
  }
}

function help() {
  console.log(`
  ${bold("The Hub CLI")}

  Commands:
    hub search <query>                Search artifacts (with freshness)
    hub context <topic>               Get smart context for a topic
    hub stale                         Show stale docs (>90 days)
    hub status                        Show workspace status
    hub open [tab]                    Open a tab in the browser
    hub help                          Show this help

  Environment:
    HUB_URL   Server URL (default: http://localhost:9002)
`);
}

// ── Color helpers ──────────────────────────────────────────────────

function dim(s) { return `\x1b[2m${s}\x1b[0m`; }
function bold(s) { return `\x1b[1m${s}\x1b[0m`; }
function green(s) { return `\x1b[32m${s}\x1b[0m`; }
function yellow(s) { return `\x1b[33m${s}\x1b[0m`; }
function red(s) { return `\x1b[31m${s}\x1b[0m`; }

// ── Router ─────────────────────────────────────────────────────────

async function main() {
  switch (command) {
    case "search":
      await search(args.join(" "));
      break;
    case "context":
      await context(args.join(" "));
      break;
    case "stale":
      await stale();
      break;
    case "open":
      await open(args[0]);
      break;
    case "status":
      await status();
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
