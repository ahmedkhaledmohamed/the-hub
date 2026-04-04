#!/usr/bin/env npx tsx

/**
 * Import Browser Bookmarks → Hub Links Panel Config
 *
 * Reads a Chrome or Firefox bookmarks HTML export and generates
 * a `links` panel configuration for hub.config.ts.
 *
 * Usage:
 *   npx tsx scripts/import-bookmarks.ts <bookmarks.html> [--folder <name>]
 *
 * Examples:
 *   npx tsx scripts/import-bookmarks.ts ~/Downloads/bookmarks.html
 *   npx tsx scripts/import-bookmarks.ts ~/Downloads/bookmarks.html --folder "Dev Tools"
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

export interface BookmarkItem {
  label: string;
  url: string;
  folder: string;
}

export interface BookmarkFolder {
  name: string;
  items: BookmarkItem[];
}

export function parseBookmarksHtml(html: string): BookmarkFolder[] {
  const folders: BookmarkFolder[] = [];
  let currentFolder = "Bookmarks";

  // Split by lines and process
  const lines = html.split("\n");

  for (const line of lines) {
    // Detect folder headers (DT > H3)
    const folderMatch = line.match(/<H3[^>]*>(.*?)<\/H3>/i);
    if (folderMatch) {
      currentFolder = folderMatch[1].replace(/<[^>]+>/g, "").trim();
      continue;
    }

    // Detect bookmark links
    const linkMatch = line.match(/<A\s+HREF="([^"]+)"[^>]*>(.*?)<\/A>/i);
    if (linkMatch) {
      const url = linkMatch[1];
      const label = linkMatch[2].replace(/<[^>]+>/g, "").trim();

      // Skip empty or internal URLs
      if (!url || !label || url.startsWith("javascript:") || url.startsWith("place:")) continue;

      let folder = folders.find((f) => f.name === currentFolder);
      if (!folder) {
        folder = { name: currentFolder, items: [] };
        folders.push(folder);
      }

      folder.items.push({ label, url, folder: currentFolder });
    }
  }

  return folders;
}

export function generatePanelConfig(
  folders: BookmarkFolder[],
  filterFolder?: string,
): string {
  const targetFolders = filterFolder
    ? folders.filter((f) => f.name.toLowerCase().includes(filterFolder.toLowerCase()))
    : folders;

  if (targetFolders.length === 0) {
    return "// No bookmarks found" + (filterFolder ? ` matching "${filterFolder}"` : "");
  }

  const panels: string[] = [];

  for (const folder of targetFolders) {
    if (folder.items.length === 0) continue;

    const items = folder.items
      .slice(0, 20) // Limit per folder
      .map((item) => {
        const domain = (() => {
          try { return new URL(item.url).hostname.replace("www.", ""); }
          catch { return ""; }
        })();
        return `      { label: "${item.label.replace(/"/g, '\\"')}", url: "${item.url}", meta: "${domain}", external: true },`;
      })
      .join("\n");

    panels.push(`    {
      type: "links",
      title: "${folder.name.replace(/"/g, '\\"')}",
      items: [
${items}
      ],
    },`);
  }

  return panels.join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const filePath = args[0];
  const folderIdx = args.indexOf("--folder");
  const filterFolder = folderIdx >= 0 ? args[folderIdx + 1] : undefined;

  if (!filePath) {
    console.error("Usage: npx tsx scripts/import-bookmarks.ts <bookmarks.html> [--folder <name>]");
    process.exit(1);
  }

  const resolved = resolve(filePath);
  if (!existsSync(resolved)) {
    console.error(`File not found: ${resolved}`);
    process.exit(1);
  }

  const html = readFileSync(resolved, "utf8");
  const folders = parseBookmarksHtml(html);

  const totalBookmarks = folders.reduce((sum, f) => sum + f.items.length, 0);
  console.log(`\nParsed ${totalBookmarks} bookmarks across ${folders.length} folder(s)`);

  if (filterFolder) {
    console.log(`Filtering to folders matching: "${filterFolder}"`);
  }

  console.log("\nFolders:");
  for (const f of folders) {
    const marker = filterFolder && f.name.toLowerCase().includes(filterFolder.toLowerCase()) ? " ✓" : "";
    console.log(`  ${f.name}: ${f.items.length} bookmarks${marker}`);
  }

  const config = generatePanelConfig(folders, filterFolder);

  console.log("\n\nAdd to hub.config.ts panels:\n");
  console.log(`  panels: {
    planning: [
${config}
    ],
  },`);
}

if (require.main === module) {
  main();
}
