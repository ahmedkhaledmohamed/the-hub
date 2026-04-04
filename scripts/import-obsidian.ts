#!/usr/bin/env npx tsx

/**
 * Import Obsidian Vault → Hub Config
 *
 * Reads an Obsidian vault directory and generates hub.config.ts
 * groups and tabs that map the vault's folder structure.
 *
 * Usage:
 *   npx tsx scripts/import-obsidian.ts <vault-path> [--label <name>]
 *
 * Examples:
 *   npx tsx scripts/import-obsidian.ts ~/Documents/my-vault
 *   npx tsx scripts/import-obsidian.ts ~/Documents/my-vault --label "My Notes"
 */

import { existsSync, readdirSync, statSync } from "fs";
import { join, basename, resolve } from "path";

interface VaultFolder {
  name: string;
  path: string;
  fileCount: number;
}

const SKIP_DIRS = new Set([".obsidian", ".git", ".trash", "node_modules", ".DS_Store"]);

function discoverFolders(vaultPath: string, prefix: string = ""): VaultFolder[] {
  const folders: VaultFolder[] = [];

  let entries: string[];
  try {
    entries = readdirSync(vaultPath);
  } catch {
    return folders;
  }

  // Count markdown files at this level
  const mdFiles = entries.filter((e) => {
    const full = join(vaultPath, e);
    return statSync(full).isFile() && e.endsWith(".md");
  });

  if (mdFiles.length > 0 && prefix) {
    folders.push({
      name: prefix || basename(vaultPath),
      path: prefix,
      fileCount: mdFiles.length,
    });
  }

  // Recurse into subdirectories
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry) || entry.startsWith(".")) continue;
    const full = join(vaultPath, entry);
    if (statSync(full).isDirectory()) {
      const subPrefix = prefix ? `${prefix}/${entry}` : entry;
      folders.push(...discoverFolders(full, subPrefix));
    }
  }

  return folders;
}

function folderToGroupId(folderName: string): string {
  return folderName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function folderToTabId(folderName: string): string {
  // Use the top-level folder as the tab
  const top = folderName.split("/")[0];
  return folderToGroupId(top);
}

const COLORS = [
  "#3b82f6", "#22c55e", "#f59e0b", "#a855f7",
  "#ec4899", "#06b6d4", "#ef4444", "#84cc16",
];

export function generateConfig(vaultPath: string, label: string): {
  workspace: { path: string; label: string };
  groups: Array<{ id: string; label: string; match: string; tab: string; color: string }>;
  tabs: Array<{ id: string; label: string; icon: string }>;
} {
  const wsName = basename(vaultPath);
  const folders = discoverFolders(vaultPath);

  // Determine unique tabs (top-level folders)
  const tabSet = new Map<string, string>();
  for (const f of folders) {
    const topFolder = f.path.split("/")[0];
    const tabId = folderToGroupId(topFolder);
    if (!tabSet.has(tabId)) {
      tabSet.set(tabId, topFolder);
    }
  }

  const tabs = Array.from(tabSet.entries()).map(([id, name], i) => ({
    id,
    label: name.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    icon: i === 0 ? "calendar" : i === 1 ? "book-open" : i === 2 ? "package" : "layers",
  }));

  const groups = folders.map((f, i) => ({
    id: folderToGroupId(f.path),
    label: basename(f.path).replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    match: `${wsName}/${f.path}/**`,
    tab: folderToTabId(f.path),
    color: COLORS[i % COLORS.length],
  }));

  return {
    workspace: { path: vaultPath, label },
    groups,
    tabs,
  };
}

function main() {
  const args = process.argv.slice(2);
  const vaultPath = args[0];
  const labelIdx = args.indexOf("--label");
  const label = labelIdx >= 0 ? args[labelIdx + 1] : undefined;

  if (!vaultPath) {
    console.error("Usage: npx tsx scripts/import-obsidian.ts <vault-path> [--label <name>]");
    process.exit(1);
  }

  const resolved = resolve(vaultPath);
  if (!existsSync(resolved)) {
    console.error(`Vault not found: ${resolved}`);
    process.exit(1);
  }

  const vaultName = label || basename(resolved);
  const config = generateConfig(resolved, vaultName);

  console.log(`\nObsidian vault: ${resolved}`);
  console.log(`Folders: ${config.groups.length}`);
  console.log(`Tabs: ${config.tabs.length}`);
  console.log("");
  console.log("Add to hub.config.ts:\n");

  console.log("// Workspace");
  console.log(`workspaces: [\n  { path: "${resolved}", label: "${vaultName}" },\n],\n`);

  console.log("// Tabs");
  console.log(`tabs: [\n${config.tabs.map((t) =>
    `  { id: "${t.id}", label: "${t.label}", icon: "${t.icon}" },`
  ).join("\n")}\n],\n`);

  console.log("// Groups");
  console.log(`groups: [\n${config.groups.map((g) =>
    `  { id: "${g.id}", label: "${g.label}", match: "${g.match}", tab: "${g.tab}", color: "${g.color}" },`
  ).join("\n")}\n],`);
}

export { discoverFolders, folderToGroupId };

if (require.main === module) {
  main();
}
