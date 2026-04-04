/**
 * Source abstraction for workspace content.
 *
 * Supports multiple ways to provide workspace content:
 * - FilesystemSource (default): reads from local filesystem
 * - GitHubSource: clones/pulls a GitHub repo
 * - S3Source: syncs from an S3 bucket
 *
 * Each source provides a local directory path that the scanner can read.
 */

import { existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { execSync } from "child_process";

// ── Types ──────────────────────────────────────────────────────────

export type SourceType = "filesystem" | "github" | "s3";

export interface SourceConfig {
  type: SourceType;
  /** Local path for filesystem, repo URL for github, bucket for s3 */
  path: string;
  /** Display label */
  label: string;
  /** Branch for GitHub source */
  branch?: string;
  /** S3 region */
  region?: string;
}

export interface ResolvedSource {
  type: SourceType;
  localPath: string;
  label: string;
  synced: boolean;
}

// ── Source resolution ──────────────────────────────────────────────

const SOURCES_DIR = resolve(".hub-data/sources");

export function resolveSource(config: SourceConfig): ResolvedSource {
  switch (config.type) {
    case "filesystem":
      return resolveFilesystem(config);
    case "github":
      return resolveGitHub(config);
    case "s3":
      return resolveS3(config);
    default:
      return resolveFilesystem(config);
  }
}

function resolveFilesystem(config: SourceConfig): ResolvedSource {
  const localPath = config.path.startsWith("~/")
    ? resolve(process.env.HOME || "/", config.path.slice(2))
    : resolve(config.path);

  return {
    type: "filesystem",
    localPath,
    label: config.label,
    synced: existsSync(localPath),
  };
}

function resolveGitHub(config: SourceConfig): ResolvedSource {
  if (!existsSync(SOURCES_DIR)) mkdirSync(SOURCES_DIR, { recursive: true });

  // Derive a safe directory name from the repo URL
  const repoName = config.path
    .replace(/^https?:\/\//, "")
    .replace(/\.git$/, "")
    .replace(/[^a-zA-Z0-9-]/g, "_");

  const localPath = join(SOURCES_DIR, repoName);
  const branch = config.branch || "main";

  let synced = false;
  try {
    if (existsSync(join(localPath, ".git"))) {
      // Pull latest
      execSync(`git -C "${localPath}" fetch origin ${branch} && git -C "${localPath}" reset --hard origin/${branch}`, {
        stdio: "pipe",
        timeout: 30000,
      });
      synced = true;
    } else {
      // Clone
      execSync(`git clone --depth 1 --branch ${branch} "${config.path}" "${localPath}"`, {
        stdio: "pipe",
        timeout: 60000,
      });
      synced = true;
    }
  } catch (err) {
    console.error(`[sources] GitHub sync failed for ${config.path}:`, err);
    synced = existsSync(localPath);
  }

  return {
    type: "github",
    localPath,
    label: config.label,
    synced,
  };
}

function resolveS3(config: SourceConfig): ResolvedSource {
  if (!existsSync(SOURCES_DIR)) mkdirSync(SOURCES_DIR, { recursive: true });

  const bucketName = config.path.replace(/^s3:\/\//, "").replace(/[^a-zA-Z0-9-]/g, "_");
  const localPath = join(SOURCES_DIR, `s3-${bucketName}`);
  const region = config.region || "us-east-1";

  let synced = false;
  try {
    if (!existsSync(localPath)) mkdirSync(localPath, { recursive: true });
    execSync(`aws s3 sync "${config.path}" "${localPath}" --region ${region}`, {
      stdio: "pipe",
      timeout: 120000,
    });
    synced = true;
  } catch (err) {
    console.error(`[sources] S3 sync failed for ${config.path}:`, err);
    synced = existsSync(localPath) && existsSync(join(localPath, "."));
  }

  return {
    type: "s3",
    localPath,
    label: config.label,
    synced,
  };
}

// ── Helpers ────────────────────────────────────────────────────────

export function getSupportedSourceTypes(): SourceType[] {
  return ["filesystem", "github", "s3"];
}

export function isValidSourceConfig(config: SourceConfig): boolean {
  return !!config.type && !!config.path && !!config.label;
}
