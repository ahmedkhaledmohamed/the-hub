import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";
import { documentHref, type LibraryEntry, type LibraryIndex } from "./library-types";

const extensions = new Set([".md", ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".csv", ".xlsx", ".docx", ".mmd", ".excalidraw"]);
const educationDownloads = new Set([".pptx", ".zip", ".rar"]);
const excluded = new Set(["node_modules", "AGENTS.md", "SKILL.md", "package-lock.json"]);
const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const stripFrontmatter = (text: string) => text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "");
const plain = (text: string) => text.replace(/<[^>]*>/g, " ").replace(/!?(?:\[([^\]]+)\])\([^)]*\)/g, "$1").replace(/[#*_`>|]/g, " ").replace(/\s+/g, " ").trim();

export async function buildLibrary(root: string, publicRoot: string, categories: unknown): Promise<LibraryIndex | null> {
  if (categories === undefined) return null;
  if (!Array.isArray(categories) || !categories.length) throw new Error("Library categories must be an explicit non-empty list.");
  const entries: LibraryEntry[] = [];
  const bodies = new Map<string, string>();
  const inlineImages = new Map<string, string>();
  const output = path.join(publicRoot, "library");
  fs.mkdirSync(path.join(output, "documents"), { recursive: true });
  fs.mkdirSync(path.join(output, "files"), { recursive: true });
  const usedPaths = new Set<string>();
  const knownCategories = categories.map(category => {
    if (!category || typeof category.id !== "string" || !/^[a-z0-9-]+$/.test(category.id)
      || typeof category.title !== "string" || typeof category.path !== "string"
      || !["projects", "career", "learning", "goals", "education"].includes(category.path)) {
      throw new Error("Library categories must select Projects, Career, Learning, Goals, or Education explicitly.");
    }
    if (usedPaths.has(category.path)) throw new Error("Library category paths must be unique.");
    usedPaths.add(category.path);
    function visit(relative: string) {
      const absolute = path.join(root, relative);
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new Error("Library sources cannot contain symbolic links.");
      if (!fs.realpathSync(absolute).startsWith(root + path.sep)) throw new Error("A Library source leaves its workspace.");
      if (stat.isDirectory()) {
        for (const name of fs.readdirSync(absolute).sort()) {
          if (!name.startsWith(".") && !excluded.has(name)) visit(path.join(relative, name));
        }
        return;
      }
      const extension = path.extname(relative).toLowerCase();
      if (!stat.isFile() || (!extensions.has(extension)
        && !(category.path === "education" && educationDownloads.has(extension)))) return;
      const sourcePath = relative.split(path.sep).join("/");
      const id = crypto.createHash("sha256").update(sourcePath).digest("hex").slice(0, 24);
      const kind = extension === ".md" ? "markdown" : extension === ".pdf" ? "pdf"
        : [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"].includes(extension) ? "image" : "file";
      const body = kind === "markdown" ? stripFrontmatter(fs.readFileSync(absolute, "utf8")) : "";
      const heading = body.match(/^#\s+(.+)$/m)?.[1];
      const title = heading ? plain(heading) : path.basename(relative, extension).replace(/[-_]/g, " ");
      const entry: LibraryEntry = { id, path: sourcePath, title: title || path.basename(relative), category: category.id,
        categoryTitle: category.title, folder: path.posix.dirname(sourcePath), format: extension.slice(1).toUpperCase(), kind,
        bytes: stat.size, text: kind === "markdown" ? plain(body) : "" };
      if (kind === "markdown") bodies.set(sourcePath, body);
      else if (extension === ".svg") {
        // SVG is rendered only as an isolated image, never served as an active same-origin document.
        inlineImages.set(sourcePath, `data:image/svg+xml;base64,${fs.readFileSync(absolute).toString("base64")}`);
      } else {
        entry.fileHref = `/library/files/${id}${extension}`;
        fs.copyFileSync(absolute, path.join(output, "files", `${id}${extension}`));
      }
      entries.push(entry);
    }
    visit(category.path);
    return { id: category.id, title: category.title, path: category.path, count: entries.filter(entry => entry.category === category.id).length };
  });
  const byPath = new Map(entries.map(entry => [entry.path, entry]));
  const ids = new Set(entries.map(entry => entry.id));
  if (ids.size !== entries.length) throw new Error("Library document identifiers must be unique.");
  for (const entry of entries) {
    if (entry.kind === "pdf") {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(fs.readFileSync(path.join(root, entry.path))) });
      try { entry.text = (await parser.getText({ pageJoiner: "" })).text.replace(/\s+/g, " ").trim(); }
      catch { entry.text = ""; }
      finally { await parser.destroy(); }
      entry.textSearch = entry.text.length > 0;
    } else if (["CSV", "MMD"].includes(entry.format)) {
      entry.text = fs.readFileSync(path.join(root, entry.path), "utf8").replace(/\s+/g, " ").trim();
    }
  }

  function destination(source: string, rawHref: string): { href: string; external?: boolean; image?: string } | null {
    const href = rawHref.trim();
    if (/^(https?:|mailto:)/i.test(href)) return { href, external: true };
    if (href.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(href)) return null;
    if (href.startsWith("#")) return { href };
    let decoded: string;
    try { decoded = decodeURIComponent(href.split(/[?#]/)[0]); } catch { return null; }
    const fragment = href.includes("#") ? "#" + href.split("#").slice(1).join("#") : "";
    const candidate = path.posix.normalize(decoded.startsWith("/") ? decoded.slice(1) : path.posix.join(path.posix.dirname(source), decoded));
    if (candidate.startsWith("../")) return null;
    const target = byPath.get(candidate) || byPath.get(path.posix.join(candidate, "README.md")) || byPath.get(path.posix.join(candidate, "00-INDEX.md"));
    if (target) return { href: documentHref(target.path) + fragment,
      image: inlineImages.get(target.path) || (target.kind === "image" ? target.fileHref : undefined) };
    if (knownCategories.some(category => candidate === category.path || candidate.startsWith(category.path + "/"))
      && fs.existsSync(path.join(root, candidate)) && fs.statSync(path.join(root, candidate)).isDirectory()) {
      return { href: `/library/?folder=${encodeURIComponent(candidate)}` };
    }
    return null;
  }

  const rendered = new Map<string, { html: string; headings: { id: string; text: string; level: number }[] }>();
  for (const entry of entries) {
    if (entry.kind !== "markdown") {
      if (inlineImages.has(entry.path)) fs.writeFileSync(path.join(output, "documents", `${entry.id}.json`), JSON.stringify({ imageData: inlineImages.get(entry.path) }));
      continue;
    }
    const headings: { id: string; text: string; level: number }[] = [];
    const slugs = new Map<string, number>();
    const parser = new Marked(markedHighlight({ highlight(code, language) {
      return hljs.highlight(code, { language: hljs.getLanguage(language) ? language : "plaintext" }).value;
    } }), { renderer: {
      html({ text }) {
        const anchor = text.match(/^\s*<a\s+(?:id|name)\s*=\s*["']([\p{L}\p{N}_.:-]+)["']\s*>\s*(?:<\/a>\s*)?$/iu);
        if (anchor) { headings.push({ id: anchor[1], text: "", level: 0 }); return `<span id="${escape(anchor[1])}"></span>`; }
        if (/^\s*<\/a>\s*$/i.test(text)) return "";
        if (/^\s*<br\s*\/?>\s*$/i.test(text)) return "<br>";
        return escape(text);
      },
      heading({ tokens, depth, text }) {
        const base = plain(text).toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s+/g, "-");
        const count = slugs.get(base) || 0; slugs.set(base, count + 1);
        const id = base + (count ? `-${count}` : "");
        headings.push({ id, text: plain(text), level: depth });
        return `<h${depth} id="${escape(id)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
      link({ href, title, tokens }) {
        const target = destination(entry.path, href), text = this.parser.parseInline(tokens);
        if (!target) return `<span class="library-local-link" title="This link is outside the published Library">${text}</span>`;
        return `<a href="${escape(target.href)}"${title ? ` title="${escape(title)}"` : ""}${target.external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${text}</a>`;
      },
      image({ href, text }) {
        const target = destination(entry.path, href);
        if (target?.image) return `<img src="${escape(target.image)}" alt="${escape(text)}" loading="lazy" decoding="async">`;
        if (target?.external) return `<a href="${escape(target.href)}" target="_blank" rel="noopener noreferrer">${escape(text || "Open image")}</a>`;
        return `<span class="library-local-link">${escape(text || "Image not included in the Library")}</span>`;
      },
    } });
    const html = parser.parse(bodies.get(entry.path)!, { async: false });
    rendered.set(entry.path, { html, headings });
  }
  const fragmentKey = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  for (const entry of entries.filter(entry => entry.kind === "markdown")) {
    const document = rendered.get(entry.path)!;
    document.html = document.html.replace(/href="([^"]*#[^"]+)"/g, (attribute, rawHref: string) => {
      let targetPath = entry.path;
      if (!rawHref.startsWith("#")) {
        if (!rawHref.startsWith("/library/read/?path=")) return attribute;
        targetPath = new URL(rawHref, "https://hub.invalid").searchParams.get("path") || "";
      }
      const target = rendered.get(targetPath); if (!target) return attribute;
      let fragment: string;
      try { fragment = decodeURIComponent(rawHref.slice(rawHref.indexOf("#") + 1)); } catch { return attribute; }
      if (target.headings.some(heading => heading.id === fragment)) return attribute;
      const candidates = target.headings.filter(heading => fragmentKey(heading.id) === fragmentKey(fragment));
      return candidates.length === 1 ? `href="${rawHref.slice(0, rawHref.indexOf("#"))}#${encodeURIComponent(candidates[0].id)}"` : attribute;
    });
    fs.writeFileSync(path.join(output, "documents", `${entry.id}.json`), JSON.stringify(document));
  }
  const index = { categories: knownCategories, entries };
  fs.writeFileSync(path.join(output, "index.json"), JSON.stringify(index));
  console.log(`Prepared Library: ${entries.length} documents and supporting files in ${knownCategories.length} categories.`);
  return index;
}
