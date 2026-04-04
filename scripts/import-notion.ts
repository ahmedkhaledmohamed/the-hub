#!/usr/bin/env npx tsx

/**
 * Import Notion Export → Hub Workspace
 *
 * Reads a Notion export (zip or extracted directory), converts pages
 * to markdown, preserves directory structure, and outputs to a target
 * workspace path.
 *
 * Usage:
 *   npx tsx scripts/import-notion.ts <source> <target>
 *
 * Examples:
 *   npx tsx scripts/import-notion.ts ~/Downloads/notion-export ./my-workspace
 *   npx tsx scripts/import-notion.ts ~/Downloads/Export.zip ./my-workspace
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { join, basename, extname, relative, resolve } from "path";
import { execSync } from "child_process";

function convertHtmlToMarkdown(html: string): string {
  // Strip Notion-specific wrapper elements
  let text = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "");

  // Convert headings
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "# $1\n\n");
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "## $1\n\n");
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "### $1\n\n");

  // Convert paragraphs
  text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "$1\n\n");

  // Convert lists
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n");
  text = text.replace(/<\/?[ou]l[^>]*>/gi, "\n");

  // Convert links
  text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");

  // Convert bold/italic
  text = text.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**");
  text = text.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "*$1*");
  text = text.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**");
  text = text.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, "*$1*");

  // Convert code
  text = text.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`");
  text = text.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, "```\n$1\n```\n\n");

  // Convert blockquotes
  text = text.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, content) =>
    content.split("\n").map((line: string) => `> ${line}`).join("\n") + "\n\n"
  );

  // Convert horizontal rules
  text = text.replace(/<hr[^>]*\/?>/gi, "\n---\n\n");

  // Convert line breaks
  text = text.replace(/<br\s*\/?>/gi, "\n");

  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode HTML entities
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, " ");

  // Clean up whitespace
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trim();

  return text;
}

function sanitizeFilename(name: string): string {
  // Notion appends a UUID to filenames — strip it
  // e.g. "My Page abc123def456.html" → "my-page.html"
  return name
    .replace(/\s+[a-f0-9]{20,}\./i, ".") // Remove Notion hex UUID (20+ chars) before extension
    .replace(/\s+[a-f0-9-]{36}\./i, ".")  // Remove UUID with dashes
    .replace(/[^\w\s.-]/g, "")             // Remove special chars
    .replace(/\s+/g, "-")                  // Spaces to hyphens
    .toLowerCase();
}

function processDirectory(sourceDir: string, targetDir: string, stats: { converted: number; copied: number; skipped: number }): void {
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  const entries = readdirSync(sourceDir);

  for (const entry of entries) {
    const sourcePath = join(sourceDir, entry);
    const stat = statSync(sourcePath);

    if (stat.isDirectory()) {
      const cleanName = sanitizeFilename(entry);
      processDirectory(sourcePath, join(targetDir, cleanName), stats);
    } else if (stat.isFile()) {
      const ext = extname(entry).toLowerCase();
      const cleanName = sanitizeFilename(entry);

      if (ext === ".html") {
        // Convert HTML to Markdown
        const html = readFileSync(sourcePath, "utf8");
        const markdown = convertHtmlToMarkdown(html);
        const mdName = cleanName.replace(/\.html$/, ".md");
        writeFileSync(join(targetDir, mdName), markdown);
        stats.converted++;
      } else if (ext === ".md") {
        // Copy markdown files as-is
        const content = readFileSync(sourcePath, "utf8");
        writeFileSync(join(targetDir, cleanName), content);
        stats.copied++;
      } else if (ext === ".csv") {
        // Copy CSV files as-is
        const content = readFileSync(sourcePath);
        writeFileSync(join(targetDir, cleanName), content);
        stats.copied++;
      } else {
        stats.skipped++;
      }
    }
  }
}

function main() {
  const [source, target] = process.argv.slice(2);

  if (!source || !target) {
    console.error("Usage: npx tsx scripts/import-notion.ts <source> <target>");
    console.error("  source: Path to Notion export (zip or extracted directory)");
    console.error("  target: Path to output workspace directory");
    process.exit(1);
  }

  const sourcePath = resolve(source);
  const targetPath = resolve(target);

  if (!existsSync(sourcePath)) {
    console.error(`Source not found: ${sourcePath}`);
    process.exit(1);
  }

  let workDir = sourcePath;

  // Handle zip files
  if (statSync(sourcePath).isFile() && sourcePath.endsWith(".zip")) {
    const tmpDir = join(targetPath, ".notion-import-tmp");
    mkdirSync(tmpDir, { recursive: true });
    console.log("Extracting zip...");
    execSync(`unzip -o "${sourcePath}" -d "${tmpDir}"`, { stdio: "pipe" });
    workDir = tmpDir;
  }

  console.log(`Importing from: ${workDir}`);
  console.log(`Output to: ${targetPath}`);
  console.log("");

  const stats = { converted: 0, copied: 0, skipped: 0 };
  processDirectory(workDir, targetPath, stats);

  // Clean up temp dir if we extracted a zip
  if (workDir !== sourcePath && workDir.endsWith(".notion-import-tmp")) {
    execSync(`rm -rf "${workDir}"`);
  }

  console.log(`Done!`);
  console.log(`  Converted: ${stats.converted} HTML → Markdown`);
  console.log(`  Copied:    ${stats.copied} (md, csv)`);
  console.log(`  Skipped:   ${stats.skipped} (images, etc.)`);
  console.log("");
  console.log(`Add to hub.config.ts:`);
  console.log(`  workspaces: [{ path: "${targetPath}", label: "${basename(targetPath)}" }]`);
}

// Export for testing
export { convertHtmlToMarkdown, sanitizeFilename, processDirectory };

if (require.main === module) {
  main();
}
