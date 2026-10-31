import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { libraryExtensions, educationDownloadExtensions, type LibraryIndex, type LibraryDocument } from "./library-types";

export interface Publication {
  builtAt: string;
  environment: "production" | "preview" | "local";
  contentCommit: string | null;
  contentBranch: string | null;
  localChanges: boolean | null;
  applicationCommit: string | null;
  applicationLocalChanges: boolean | null;
  pinnedApplicationCommit: string | null;
  applicationMatchesPin: boolean | null;
  guidePath: string | null;
  overviewPath: string | null;
  deploymentDashboardUrl: string | null;
  deploymentId: string | null;
  libraryCount: number;
  categories: { title: string; path: string; count: number }[];
  outsideLibrary: string[];
  assetPaths: string[];
  assetCount: number;
  fileTypes: { standard: string[]; educationDownloads: string[] };
}

type PublicationSpec = { web?: {
  hubRevision?: string; guidePath?: string; overviewPath?: string;
  deploymentDashboardUrl?: string; publishPaths?: string[];
} };

function git(root: string, args: string[]): string | null {
  try { return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return null; }
}
const commit = (value: unknown) => typeof value === "string" && /^[a-f0-9]{40}$/.test(value) ? value : null;

export function buildPublication(root: string, applicationRoot: string, spec: PublicationSpec, library: LibraryIndex | null, assetCount: number): Publication {
  function selectedDocument(value: unknown): string | null {
    if (value === undefined) return null;
    if (typeof value !== "string" || !library?.entries.some(entry => entry.path === value && entry.kind === "markdown")) {
      throw new Error("Hub guide and overview pages must select a Markdown document in the published Library.");
    }
    return value;
  }
  const contentCommit = commit(git(root, ["rev-parse", "HEAD"])) || commit(process.env.VERCEL_GIT_COMMIT_SHA);
  const applicationCommit = commit(git(applicationRoot, ["rev-parse", "HEAD"]));
  const applicationStatus = git(applicationRoot, ["status", "--porcelain", "--untracked-files=normal"]);
  const pinnedApplicationCommit = commit(spec.web?.hubRevision);
  const status = git(root, ["status", "--porcelain", "--untracked-files=normal"]);
  const categories = library?.categories.map(({ title, path, count }) => ({ title, path, count })) || [];
  const selected = new Set(categories.map(category => category.path));
  const tracked = git(root, ["ls-tree", "-d", "--name-only", "HEAD"]);
  const folders = tracked === null
    ? fs.readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name)
    : tracked.split("\n");
  let deploymentDashboardUrl: string | null = null;
  if (spec.web?.deploymentDashboardUrl !== undefined) {
    const url = new URL(spec.web.deploymentDashboardUrl);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("The deployment dashboard must use an HTTPS URL without credentials.");
    deploymentDashboardUrl = url.href;
  }
  return {
    builtAt: new Date().toISOString(),
    environment: process.env.VERCEL_ENV === "production" ? "production" : process.env.VERCEL_ENV === "preview" ? "preview" : "local",
    contentCommit,
    contentBranch: process.env.VERCEL_GIT_COMMIT_REF || git(root, ["branch", "--show-current"]) || null,
    localChanges: status === null ? null : status.length > 0,
    applicationCommit, applicationLocalChanges: applicationStatus === null ? null : applicationStatus.length > 0, pinnedApplicationCommit,
    applicationMatchesPin: applicationCommit && pinnedApplicationCommit ? applicationCommit === pinnedApplicationCommit : null,
    guidePath: selectedDocument(spec.web?.guidePath), overviewPath: selectedDocument(spec.web?.overviewPath),
    deploymentDashboardUrl,
    deploymentId: /^dpl_[A-Za-z0-9]+$/.test(process.env.VERCEL_DEPLOYMENT_ID || "") ? process.env.VERCEL_DEPLOYMENT_ID! : null,
    libraryCount: library?.entries.length || 0, categories,
    outsideLibrary: folders.filter(folder => folder && !folder.startsWith(".") && folder !== "node_modules" && !selected.has(folder)).sort(),
    assetPaths: spec.web?.publishPaths || [], assetCount,
    fileTypes: { standard: libraryExtensions, educationDownloads: educationDownloadExtensions },
  };
}

export function readPublication(): Publication {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/publication.json"), "utf8"));
}

export function readGuide(documentPath: string | null) {
  if (!documentPath) return null;
  const library: LibraryIndex = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/library/index.json"), "utf8"));
  const entry = library.entries.find(entry => entry.path === documentPath && entry.kind === "markdown");
  if (!entry) throw new Error("The selected guide is not in the published Library.");
  const document: LibraryDocument = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/library/documents", `${entry.id}.json`), "utf8"));
  return { entry: { ...entry, text: "" }, document };
}
