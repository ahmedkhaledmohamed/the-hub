import fs from "node:fs";
import path from "node:path";
import type { HubConfig } from "./types";

export interface StartLink {
  label: string;
  href: string;
  external: boolean;
}

export interface StartEntry {
  id: string;
  name: string;
  description?: string;
  previewHref?: string;
  links: StartLink[];
}

export interface StartSection {
  id: string;
  title: string;
  entries: StartEntry[];
}

export interface StartCatalog {
  description: string;
  updated?: string;
  sections: StartSection[];
  sources: StartLink[];
  warnings: string[];
}

function fileHref(root: string, relative: unknown): string | null {
  if (typeof relative !== "string" || !relative || path.isAbsolute(relative)) return null;
  try {
    const realRoot = fs.realpathSync(root);
    const realFile = fs.realpathSync(path.resolve(root, relative));
    if (!realFile.startsWith(realRoot + path.sep) || !fs.statSync(realFile).isFile()) return null;
    // Match the existing workspace file API's basename-based routing contract.
    const segments = [path.basename(root), ...path.relative(root, path.resolve(root, relative)).split(path.sep)];
    return `/api/file/${segments.map(encodeURIComponent).join("/")}`;
  } catch {
    return null;
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function resolveLink(root: string, value: unknown): StartLink | null {
  if (!record(value) || typeof value.label !== "string" || !value.label.trim()) return null;
  if (value.path !== undefined && value.url === undefined) {
    const href = fileHref(root, value.path);
    return href ? { label: value.label, href, external: false } : null;
  }
  if (typeof value.url !== "string" || value.path !== undefined) return null;
  try {
    const url = new URL(value.url);
    return ["https:", "http:"].includes(url.protocol)
      ? { label: value.label, href: url.href, external: true } : null;
  } catch {
    return null;
  }
}

export function hasStartCatalog(config: HubConfig): boolean {
  return config.workspaces.some(workspace => fs.existsSync(path.join(workspace.path, "hub.catalog.json")));
}

export function loadStartCatalog(config: HubConfig): StartCatalog | null {
  if (!hasStartCatalog(config)) return null;
  const catalog: StartCatalog = { description: "Projects, tools, pages, and visualizations in one place.", sections: [], sources: [], warnings: [] };
  const sections = new Map<string, StartSection>();
  for (const workspace of config.workspaces) {
    const filename = path.join(workspace.path, "hub.catalog.json");
    if (!fs.existsSync(filename)) continue;
    const source = `${workspace.label}/hub.catalog.json`;
    const sourceHref = fileHref(workspace.path, "hub.catalog.json");
    if (!sourceHref) { catalog.warnings.push(`${source} is not a readable file inside its workspace.`); continue; }
    catalog.sources.push({ label: source, href: sourceHref, external: false });
    let parsed: unknown;
    try { parsed = JSON.parse(fs.readFileSync(filename, "utf8")); }
    catch { catalog.warnings.push(`${source} could not be read as JSON.`); continue; }
    if (!record(parsed) || parsed.version !== 1 || !Array.isArray(parsed.sections)) {
      catalog.warnings.push(`${source} needs version 1 and a sections list.`); continue;
    }
    if (typeof parsed.description === "string") catalog.description = parsed.description;
    if (typeof parsed.updated === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.updated)) catalog.updated = parsed.updated;
    for (const section of parsed.sections) {
      if (!record(section) || typeof section.id !== "string" || !/^[a-z0-9-]+$/.test(section.id)
        || typeof section.title !== "string" || !Array.isArray(section.entries)) {
        catalog.warnings.push(`${source} contains an invalid section.`); continue;
      }
      let target = sections.get(section.id);
      if (!target) { target = { id: section.id, title: section.title, entries: [] }; sections.set(section.id, target); }
      for (const entry of section.entries) {
        if (!record(entry) || typeof entry.id !== "string" || typeof entry.name !== "string" || !Array.isArray(entry.links)) {
          catalog.warnings.push(`${source}: an entry needs an id, name, and links.`); continue;
        }
        const links = entry.links.map(link => resolveLink(workspace.path, link)).filter((link): link is StartLink => link !== null);
        if (!links.length) { catalog.warnings.push(`${source}: ${entry.name} has no valid links.`); continue; }
        if (links.length !== entry.links.length) catalog.warnings.push(`${source}: ${entry.name} has an unavailable or unsupported link.`);
        const previewHref = entry.previewPath === undefined ? undefined : fileHref(workspace.path, entry.previewPath) || undefined;
        target.entries.push({ id: `${path.basename(workspace.path)}:${section.id}:${entry.id}`, name: entry.name,
          description: typeof entry.description === "string" ? entry.description : undefined, previewHref, links });
      }
    }
  }
  catalog.sections = [...sections.values()];
  return catalog;
}
