import { createHash } from "crypto";
import { readFileSync } from "fs";
import { basename, extname, resolve, dirname } from "path";
import type { Artifact, HygieneFinding, HygieneReport, HygieneRule } from "./types";
import { loadConfig, getResolvedWorkspacePaths } from "./config";

// ── Content helpers ───────────────────────────────────────────────────

function resolveFullPath(artifactPath: string): string {
  const config = loadConfig();
  const wsPaths = getResolvedWorkspacePaths(config);
  const segments = artifactPath.split("/");
  const wsLabel = segments[0];
  const rest = segments.slice(1).join("/");

  for (const ws of config.workspaces) {
    const wsName = basename(ws.path.replace(/^~\//, ""));
    if (wsName === wsLabel || ws.label === wsLabel) {
      const resolved = ws.path.startsWith("~/")
        ? resolve(process.env.HOME || "/", ws.path.slice(2))
        : resolve(ws.path);
      return resolve(resolved, rest);
    }
  }
  return resolve(wsPaths[0] || ".", rest);
}

function readContent(artifactPath: string): string {
  try {
    return readFileSync(resolveFullPath(artifactPath), "utf8");
  } catch {
    return "";
  }
}

function normalize(content: string, ext: string): string {
  let text = content;
  if (ext === ".html") {
    text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
    text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
    text = text.replace(/<[^>]+>/g, " ");
  }
  if (ext === ".md") {
    text = text.replace(/```[\s\S]*?```/g, "");
    text = text.replace(/^---[\s\S]*?---/m, "");
  }
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const v of a) { if (b.has(v)) intersection++; }
  return intersection / (a.size + b.size - intersection);
}

function shingle(tokens: string[], n: number = 5): Set<string> {
  const shingles = new Set<string>();
  for (let i = 0; i <= tokens.length - n; i++) {
    shingles.add(tokens.slice(i, i + n).join(" "));
  }
  return shingles;
}

function isSourceExportPair(pathA: string, pathB: string): boolean {
  const extA = extname(pathA).toLowerCase();
  const extB = extname(pathB).toLowerCase();
  if (!((extA === ".md" && extB === ".html") || (extA === ".html" && extB === ".md"))) return false;
  const baseA = basename(pathA, extA).toLowerCase().replace(/[_-]/g, " ");
  const baseB = basename(pathB, extB).toLowerCase().replace(/[_-]/g, " ");
  const tokA = new Set(baseA.split(/\s+/).filter((w) => w.length > 2));
  const tokB = new Set(baseB.split(/\s+/).filter((w) => w.length > 2));
  return jaccard(tokA, tokB) >= 0.5;
}

function stripBrandSuffix(title: string): string {
  return title.replace(/\s*\|\s*[^|]+$/, "").trim();
}

// ── Detectors ─────────────────────────────────────────────────────────

interface ContentEntry {
  artifact: Artifact;
  normalized: string;
  hash: string;
  tokens: string[];
}

function detectExactDuplicates(entries: ContentEntry[]): HygieneFinding[] {
  const byHash = new Map<string, ContentEntry[]>();
  for (const e of entries) {
    if (!e.normalized) continue;
    const group = byHash.get(e.hash) || [];
    group.push(e);
    byHash.set(e.hash, group);
  }

  const findings: HygieneFinding[] = [];
  for (const [, group] of byHash) {
    if (group.length < 2) continue;
    const sorted = group.sort((a, b) =>
      new Date(b.artifact.modifiedAt).getTime() - new Date(a.artifact.modifiedAt).getTime()
    );
    const newest = sorted[0].artifact;
    const rest = sorted.slice(1).map((e) => e.artifact);
    findings.push({
      id: `exact:${sha256(group.map((e) => e.artifact.path).sort().join("|")).slice(0, 12)}`,
      type: "exact-duplicate",
      severity: "high",
      artifacts: sorted.map((e) => e.artifact),
      similarity: 1.0,
      suggestion: `Identical content in ${group.length} files. Keep "${newest.path}" (most recent) and remove ${rest.map((a) => `"${a.path}"`).join(", ")}.`,
    });
  }
  return findings;
}

function detectNearDuplicates(entries: ContentEntry[], exactPairs: Set<string>): HygieneFinding[] {
  const findings: HygieneFinding[] = [];
  const eligible = entries.filter((e) => e.tokens.length >= 50);

  const shingledEntries = eligible.map((e) => ({
    ...e,
    shingles: shingle(e.tokens),
  }));

  const buckets = new Map<string, number[]>();
  for (let i = 0; i < shingledEntries.length; i++) {
    const seen = new Set<string>();
    for (const s of shingledEntries[i].shingles) {
      const bucket = sha256(s).slice(0, 6);
      if (seen.has(bucket)) continue;
      seen.add(bucket);
      const list = buckets.get(bucket) || [];
      list.push(i);
      buckets.set(bucket, list);
    }
  }

  const compared = new Set<string>();
  for (const [, indices] of buckets) {
    if (indices.length < 2 || indices.length > 50) continue;
    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        const a = shingledEntries[indices[i]];
        const b = shingledEntries[indices[j]];

        const pairKey = [a.artifact.path, b.artifact.path].sort().join("|");
        if (compared.has(pairKey) || exactPairs.has(pairKey)) continue;
        compared.add(pairKey);

        const sizeRatio = Math.min(a.tokens.length, b.tokens.length) / Math.max(a.tokens.length, b.tokens.length);
        if (sizeRatio < 0.15) continue;

        const sim = jaccard(a.shingles, b.shingles);
        if (sim < 0.45) continue;

        const isExport = isSourceExportPair(a.artifact.path, b.artifact.path);
        const severity = sim >= 0.7 ? "high" : sim >= 0.5 ? "medium" : "low";
        const tag = isExport ? " (source↔export pair)" : "";
        findings.push({
          id: `near:${sha256(pairKey).slice(0, 12)}`,
          type: "near-duplicate",
          severity,
          artifacts: [a.artifact, b.artifact],
          similarity: Math.round(sim * 100) / 100,
          suggestion: `${Math.round(sim * 100)}% content overlap${tag}. Review both files and consider consolidating into a single source of truth.`,
        });
      }
    }
  }

  const sorted = findings.sort((a, b) => (b.similarity || 0) - (a.similarity || 0)).slice(0, 100);
  return classifyTemplateOverlap(sorted);
}

/**
 * Reclassify near-duplicate findings that are likely template/boilerplate overlap.
 * If a document appears in 4+ near-duplicate pairs, its lower-similarity matches
 * (below 0.6) are likely driven by shared template structure, not genuine content duplication.
 */
function classifyTemplateOverlap(findings: HygieneFinding[]): HygieneFinding[] {
  const pairCount = new Map<string, number>();
  for (const f of findings) {
    for (const a of f.artifacts) {
      pairCount.set(a.path, (pairCount.get(a.path) || 0) + 1);
    }
  }

  const hubPaths = new Set(
    Array.from(pairCount.entries())
      .filter(([, count]) => count >= 4)
      .map(([path]) => path)
  );

  return findings.map((f) => {
    if (f.type !== "near-duplicate") return f;
    const sim = f.similarity || 0;
    const involvesHub = f.artifacts.some((a) => hubPaths.has(a.path));
    if (involvesHub && sim < 0.6) {
      return {
        ...f,
        type: "template-overlap" as const,
        severity: "low" as const,
        suggestion: `${Math.round(sim * 100)}% overlap — likely shared template or boilerplate structure rather than duplicate content. Review if the shared sections can be extracted into a common template.`,
      };
    }
    return f;
  });
}

function detectSimilarTitles(artifacts: Artifact[], alreadyFlagged: Set<string>): HygieneFinding[] {
  const findings: HygieneFinding[] = [];
  const titleTokens = artifacts.map((a) => ({
    artifact: a,
    tokens: new Set(tokenize(stripBrandSuffix(a.title))),
  }));

  for (let i = 0; i < titleTokens.length; i++) {
    for (let j = i + 1; j < titleTokens.length; j++) {
      const a = titleTokens[i];
      const b = titleTokens[j];
      if (a.tokens.size < 3 || b.tokens.size < 3) continue;

      const pairKey = [a.artifact.path, b.artifact.path].sort().join("|");
      if (alreadyFlagged.has(pairKey)) continue;

      const sim = jaccard(a.tokens, b.tokens);
      if (sim < 0.5) continue;

      if (a.artifact.group === b.artifact.group) continue;

      const isExport = isSourceExportPair(a.artifact.path, b.artifact.path);
      const tag = isExport ? " (likely source↔export)" : "";
      findings.push({
        id: `title:${sha256(pairKey).slice(0, 12)}`,
        type: "similar-title",
        severity: sim >= 0.8 ? "high" : "medium",
        artifacts: [a.artifact, b.artifact],
        similarity: Math.round(sim * 100) / 100,
        suggestion: `Similar titles across different groups${tag}. These may cover the same topic — consider consolidating or cross-referencing.`,
      });
    }
  }

  return findings.sort((a, b) => (b.similarity || 0) - (a.similarity || 0)).slice(0, 80);
}

function detectSameFilename(artifacts: Artifact[], alreadyFlagged: Set<string>): HygieneFinding[] {
  const IGNORE_NAMES = new Set(["readme.md", "index.md", "index.html", "changelog.md", "license.md", "claude.md", "skill.md", "agents.md"]);
  const byName = new Map<string, Artifact[]>();

  for (const a of artifacts) {
    const name = basename(a.path).toLowerCase();
    if (IGNORE_NAMES.has(name)) continue;
    const group = byName.get(name) || [];
    group.push(a);
    byName.set(name, group);
  }

  const findings: HygieneFinding[] = [];
  for (const [name, group] of byName) {
    if (group.length < 2) continue;

    const pairKey = group.map((a) => a.path).sort().join("|");
    if (alreadyFlagged.has(pairKey)) continue;

    const dirs = group.map((a) => dirname(a.path));
    findings.push({
      id: `fname:${sha256(pairKey).slice(0, 12)}`,
      type: "same-filename",
      severity: "medium",
      artifacts: group,
      suggestion: `"${name}" exists in ${group.length} directories (${dirs.join(", ")}). One may be outdated.`,
    });
  }

  return findings;
}

function detectSupersededAndOrphans(artifacts: Artifact[], alreadyFlagged: Set<string>): HygieneFinding[] {
  const findings: HygieneFinding[] = [];
  const ARCHIVE_PATTERNS = /\b(archive|old|deprecated|backup|legacy)\b/i;

  const archived = artifacts.filter((a) => ARCHIVE_PATTERNS.test(a.path));
  const live = artifacts.filter((a) => !ARCHIVE_PATTERNS.test(a.path));

  for (const arch of archived) {
    const archName = basename(arch.path, extname(arch.path)).toLowerCase();
    const archTokens = new Set(tokenize(archName));
    if (archTokens.size < 2) continue;

    for (const l of live) {
      const pairKey = [arch.path, l.path].sort().join("|");
      if (alreadyFlagged.has(pairKey)) continue;

      const liveName = basename(l.path, extname(l.path)).toLowerCase();
      const liveTokens = new Set(tokenize(liveName));
      if (liveTokens.size < 2) continue;

      const sim = jaccard(archTokens, liveTokens);
      if (sim < 0.5) continue;

      if (l.staleDays < arch.staleDays) {
        findings.push({
          id: `super:${sha256(pairKey).slice(0, 12)}`,
          type: "superseded",
          severity: "low",
          artifacts: [arch, l],
          similarity: Math.round(sim * 100) / 100,
          suggestion: `"${arch.path}" appears to be an older version of "${l.path}". Consider deleting the archived copy if the live version is complete.`,
        });
      }
    }
  }

  const staleOrphans = artifacts.filter(
    (a) => a.staleDays > 90 && ARCHIVE_PATTERNS.test(a.path)
  );
  for (const orphan of staleOrphans.slice(0, 30)) {
    const pairKey = orphan.path;
    if (alreadyFlagged.has(pairKey)) continue;

    findings.push({
      id: `orphan:${sha256(pairKey).slice(0, 12)}`,
      type: "stale-orphan",
      severity: "low",
      artifacts: [orphan],
      suggestion: `Stale file in archive directory (${orphan.staleDays} days old). Review whether it's still needed.`,
    });
  }

  return findings;
}

// ── Main analyzer ─────────────────────────────────────────────────────

let cachedReport: HygieneReport | null = null;
let cachedManifestSignature = "";

export function analyzeHygiene(artifacts: Artifact[], manifestGeneratedAt: string): HygieneReport {
  const signature = `${artifacts.length}:${manifestGeneratedAt}`;
  if (cachedReport && cachedManifestSignature === signature) return cachedReport;

  console.log(`[hygiene] Analyzing ${artifacts.length} artifacts...`);
  const start = Date.now();

  const TEXT_TYPES = new Set(["md", "html", "csv", "txt", "json"]);
  const entries: ContentEntry[] = artifacts
    .filter((a) => TEXT_TYPES.has(a.type))
    .map((a) => {
      const raw = readContent(a.path);
      const ext = extname(a.path).toLowerCase();
      const normalized = normalize(raw, ext);
      return {
        artifact: a,
        normalized,
        hash: sha256(normalized),
        tokens: tokenize(normalized),
      };
    });

  const exactFindings = detectExactDuplicates(entries);
  const exactPairs = new Set<string>();
  for (const f of exactFindings) {
    for (let i = 0; i < f.artifacts.length; i++) {
      for (let j = i + 1; j < f.artifacts.length; j++) {
        exactPairs.add([f.artifacts[i].path, f.artifacts[j].path].sort().join("|"));
      }
    }
  }

  const nearFindings = detectNearDuplicates(entries, exactPairs);
  const allFlaggedPairs = new Set(exactPairs);
  for (const f of nearFindings) {
    allFlaggedPairs.add(f.artifacts.map((a) => a.path).sort().join("|"));
  }

  const titleFindings = detectSimilarTitles(artifacts, allFlaggedPairs);
  for (const f of titleFindings) {
    allFlaggedPairs.add(f.artifacts.map((a) => a.path).sort().join("|"));
  }

  const filenameFindings = detectSameFilename(artifacts, allFlaggedPairs);
  for (const f of filenameFindings) {
    allFlaggedPairs.add(f.artifacts.map((a) => a.path).sort().join("|"));
  }

  const orphanFindings = detectSupersededAndOrphans(artifacts, allFlaggedPairs);

  // Custom rules from hub.config.ts
  const customFindings = evaluateCustomRules(artifacts);

  const findings = [
    ...exactFindings,
    ...nearFindings,
    ...titleFindings,
    ...filenameFindings,
    ...orphanFindings,
    ...customFindings,
  ];

  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  for (const f of findings) {
    byType[f.type] = (byType[f.type] || 0) + 1;
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
  }

  const elapsed = Date.now() - start;
  console.log(`[hygiene] Done: ${findings.length} findings in ${elapsed}ms`);

  cachedReport = {
    findings,
    stats: {
      totalFindings: findings.length,
      byType,
      bySeverity,
      filesAnalyzed: entries.length,
      analyzedAt: new Date().toISOString(),
    },
  };
  cachedManifestSignature = signature;
  return cachedReport;
}

export function invalidateHygieneCache(): void {
  cachedReport = null;
  cachedManifestSignature = "";
}

/**
 * Get the cached hygiene finding count (without re-running analysis).
 * Returns null if no cached report exists.
 */
export function getCachedHygieneFindingCount(): number | null {
  return cachedReport ? cachedReport.stats.totalFindings : null;
}

/**
 * Get a summary of cached hygiene findings by severity.
 */
export function getCachedHygieneSummary(): { total: number; high: number; medium: number; low: number } | null {
  if (!cachedReport) return null;
  return {
    total: cachedReport.stats.totalFindings,
    high: cachedReport.stats.bySeverity.high || 0,
    medium: cachedReport.stats.bySeverity.medium || 0,
    low: cachedReport.stats.bySeverity.low || 0,
  };
}

// ── Custom hygiene rules (hygiene-as-code) ───────────────────────

/**
 * Evaluate a single custom hygiene rule against artifacts.
 */
export function evaluateRule(rule: HygieneRule, artifacts: Artifact[]): HygieneFinding[] {
  // Filter artifacts by match pattern or group
  let scoped = artifacts;
  if (rule.match) {
    const { minimatch } = require("minimatch");
    scoped = artifacts.filter((a) => minimatch(a.path, rule.match!));
  } else if (rule.group) {
    scoped = artifacts.filter((a) => a.group === rule.group);
  }

  if (scoped.length === 0) return [];

  const findings: HygieneFinding[] = [];

  switch (rule.type) {
    case "max-staleness": {
      const maxDays = rule.config.maxDays || 90;
      const stale = scoped.filter((a) => a.staleDays > maxDays);
      for (const a of stale) {
        findings.push({
          id: `rule:${rule.id}:${a.path}`,
          type: "stale-orphan",
          severity: rule.severity,
          artifacts: [a],
          suggestion: `${rule.name}: "${a.title}" is ${a.staleDays} days old (max: ${maxDays}d)`,
        });
      }
      break;
    }
    case "required-field": {
      const field = rule.config.field;
      if (!field) break;
      const pattern = new RegExp(`^\\s*${field}\\s*[:=]`, "im");
      for (const a of scoped) {
        const content = readContent(a.path);
        if (!pattern.test(content)) {
          findings.push({
            id: `rule:${rule.id}:${a.path}`,
            type: "stale-orphan",
            severity: rule.severity,
            artifacts: [a],
            suggestion: `${rule.name}: "${a.title}" is missing required field "${field}"`,
          });
        }
      }
      break;
    }
    case "max-similarity": {
      const maxSim = (rule.config.maxSimilarity || 80) / 100;
      for (let i = 0; i < scoped.length; i++) {
        for (let j = i + 1; j < scoped.length; j++) {
          const contentA = readContent(scoped[i].path);
          const contentB = readContent(scoped[j].path);
          if (!contentA || !contentB) continue;
          const tokensA = new Set(tokenize(normalize(contentA, extname(scoped[i].path))));
          const tokensB = new Set(tokenize(normalize(contentB, extname(scoped[j].path))));
          const sim = jaccard(tokensA, tokensB);
          if (sim > maxSim) {
            findings.push({
              id: `rule:${rule.id}:${scoped[i].path}:${scoped[j].path}`,
              type: "near-duplicate",
              severity: rule.severity,
              artifacts: [scoped[i], scoped[j]],
              similarity: sim,
              suggestion: `${rule.name}: ${Math.round(sim * 100)}% similar (max: ${rule.config.maxSimilarity}%)`,
            });
          }
        }
      }
      break;
    }
    case "no-duplicates": {
      // Check for exact content duplicates within scope
      const hashes = new Map<string, Artifact[]>();
      for (const a of scoped) {
        const content = readContent(a.path);
        if (!content) continue;
        const hash = sha256(normalize(content, extname(a.path)));
        const list = hashes.get(hash) || [];
        list.push(a);
        hashes.set(hash, list);
      }
      for (const [, group] of hashes) {
        if (group.length > 1) {
          findings.push({
            id: `rule:${rule.id}:${group.map((a) => a.path).join(":")}`,
            type: "exact-duplicate",
            severity: rule.severity,
            artifacts: group,
            similarity: 1.0,
            suggestion: `${rule.name}: ${group.length} identical files in scope`,
          });
        }
      }
      break;
    }
    case "custom":
      // Custom rules just flag that the rule exists — actual evaluation is manual
      break;
  }

  return findings;
}

/**
 * Evaluate all custom hygiene rules from config.
 */
export function evaluateCustomRules(artifacts: Artifact[]): HygieneFinding[] {
  const config = loadConfig();
  const rules = config.hygieneRules || [];
  if (rules.length === 0) return [];

  const findings: HygieneFinding[] = [];
  for (const rule of rules) {
    findings.push(...evaluateRule(rule, artifacts));
  }
  return findings;
}

export { resolveFullPath };
