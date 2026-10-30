import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadStartCatalog } from "../src/lib/start-catalog";
import type { HubConfig } from "../src/lib/types";
import { buildLibrary } from "./library-build";

const root = process.env.HUB_CONTENT_ROOT;
if (!root) throw new Error("HUB_CONTENT_ROOT must point to the Personal content checkout.");
const realRoot = fs.realpathSync(root);
const config = { workspaces: [{ path: realRoot, label: "Personal" }] } as HubConfig;
const catalog = loadStartCatalog(config);
if (!catalog || catalog.warnings.length) throw new Error("Resolve the Personal catalog's missing or invalid links before publishing.");
const spec = JSON.parse(fs.readFileSync(path.join(realRoot, "hub.catalog.json"), "utf8"));
const publishPaths: unknown = spec.web?.publishPaths;
if (!Array.isArray(publishPaths) || !publishPaths.length) throw new Error("The catalog needs an explicit web.publishPaths allowlist.");
const webRoot = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(webRoot, "public");
fs.rmSync(publicRoot, { recursive: true, force: true });
fs.mkdirSync(publicRoot, { recursive: true });
const allowedFiles = new Set<string>();
const workspaceName = path.basename(realRoot);

function copy(relative: string) {
  const file = fs.realpathSync(path.resolve(realRoot, relative));
  if (!file.startsWith(realRoot + path.sep)) throw new Error("A published path leaves the Personal workspace.");
  const info = fs.lstatSync(path.resolve(realRoot, relative));
  if (info.isSymbolicLink()) throw new Error("Published content cannot contain symbolic links.");
  if (info.isDirectory()) {
    for (const name of fs.readdirSync(file)) {
      if (name.startsWith(".")) throw new Error("Published content cannot contain hidden files.");
      copy(path.join(relative, name));
    }
  } else if (info.isFile()) {
    const href = `/api/file/${[workspaceName, ...relative.split(path.sep)].map(encodeURIComponent).join("/")}`;
    const target = path.join(publicRoot, "api", "file", workspaceName, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(file, target);
    allowedFiles.add(href);
  }
}
for (const item of publishPaths) {
  if (typeof item !== "string" || path.isAbsolute(item) || item.split(/[\\/]/).some(part => !part || part === "." || part === ".." || part.startsWith("."))) {
    throw new Error("Published paths must be explicit relative paths without hidden or parent segments.");
  }
  copy(item);
}
catalog.sections = catalog.sections.map(section => ({ ...section,
  entries: section.entries.map(entry => ({ ...entry,
    links: entry.links.filter(link => link.external || allowedFiles.has(link.href)),
    previewHref: entry.previewHref && allowedFiles.has(entry.previewHref) ? entry.previewHref : undefined,
  })).filter(entry => entry.links.length > 0),
})).filter(section => section.entries.length > 0);
catalog.sources = [];
await buildLibrary(realRoot, publicRoot, spec.web?.library?.categories);
fs.writeFileSync(path.join(webRoot, "catalog.generated.json"), JSON.stringify(catalog));
console.log(`Prepared ${catalog.sections.reduce((n, section) => n + section.entries.length, 0)} Hub entries and ${allowedFiles.size} explicitly published files.`);
