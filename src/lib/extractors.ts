import fs from "fs";
import path from "path";
import type { Artifact } from "./types";

// ── Extractor interface ────────────────────────────────────────────

export interface Extractor {
  /** File extensions this extractor handles (lowercase, with dot) */
  extensions: string[];
  /** Map extension to artifact type */
  artifactType: Artifact["type"];
  /** Extract a human-readable title from the file */
  extractTitle(filePath: string, content: string): string | null;
  /** Extract a plain-text snippet for preview */
  extractSnippet(content: string, maxLen: number): string | undefined;
  /** Extract full searchable text content */
  extractText(content: string): string;
}

// ── Markdown extractor ─────────────────────────────────────────────

const markdownExtractor: Extractor = {
  extensions: [".md"],
  artifactType: "md",
  extractTitle(_filePath, content) {
    const match = content.slice(0, 2000).match(/^#\s+(.+)$/m);
    return match ? match[1].replace(/[*_`]/g, "").trim() : null;
  },
  extractSnippet(content, maxLen) {
    const lines = content.split("\n").filter(
      (l) => l.trim() && !l.startsWith("#") && !l.startsWith("---") && !l.startsWith("```"),
    );
    return lines.slice(0, 5).join(" ").slice(0, maxLen) || undefined;
  },
  extractText(content) {
    return content;
  },
};

// ── HTML extractor ─────────────────────────────────────────────────

const htmlExtractor: Extractor = {
  extensions: [".html", ".htm"],
  artifactType: "html",
  extractTitle(_filePath, content) {
    const head = content.slice(0, 2000);
    const titleMatch = head.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) return titleMatch[1].trim();
    const h1Match = head.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (h1Match) return h1Match[1].trim();
    return null;
  },
  extractSnippet(content, maxLen) {
    const stripped = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return stripped.slice(0, maxLen) || undefined;
  },
  extractText(content) {
    return content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  },
};

// ── SVG extractor ──────────────────────────────────────────────────

const svgExtractor: Extractor = {
  extensions: [".svg"],
  artifactType: "svg",
  extractTitle(filePath) {
    return null; // SVGs rarely have meaningful text titles
  },
  extractSnippet() {
    return undefined;
  },
  extractText(content) {
    // Extract text elements from SVG
    const texts = content.match(/<text[^>]*>([^<]*)<\/text>/gi) || [];
    return texts.map((t) => t.replace(/<[^>]+>/g, "")).join(" ");
  },
};

// ── CSV extractor ──────────────────────────────────────────────────

const csvExtractor: Extractor = {
  extensions: [".csv"],
  artifactType: "csv",
  extractTitle() {
    return null;
  },
  extractSnippet(content, maxLen) {
    const firstLine = content.split("\n")[0];
    return firstLine?.slice(0, maxLen) || undefined;
  },
  extractText(content) {
    return content;
  },
};

// ── Plain text extractor ───────────────────────────────────────────

const textExtractor: Extractor = {
  extensions: [".txt", ".log"],
  artifactType: "txt",
  extractTitle(_filePath, content) {
    const firstLine = content.split("\n")[0]?.trim();
    return firstLine && firstLine.length <= 100 ? firstLine : null;
  },
  extractSnippet(content, maxLen) {
    const lines = content.split("\n").filter((l) => l.trim()).slice(0, 5);
    return lines.join(" ").slice(0, maxLen) || undefined;
  },
  extractText(content) {
    return content;
  },
};

// ── JSON extractor ─────────────────────────────────────────────────

const jsonExtractor: Extractor = {
  extensions: [".json"],
  artifactType: "json",
  extractTitle(filePath, content) {
    try {
      const obj = JSON.parse(content.slice(0, 10000));
      return obj.name || obj.title || null;
    } catch {
      return null;
    }
  },
  extractSnippet(content, maxLen) {
    return content.slice(0, maxLen);
  },
  extractText(content) {
    // Extract string values for searchability
    try {
      const obj = JSON.parse(content);
      return extractJsonStrings(obj).join(" ");
    } catch {
      return content;
    }
  },
};

function extractJsonStrings(obj: unknown, depth = 0): string[] {
  if (depth > 5) return [];
  if (typeof obj === "string") return [obj];
  if (Array.isArray(obj)) return obj.flatMap((v) => extractJsonStrings(v, depth + 1));
  if (obj && typeof obj === "object") {
    return Object.values(obj).flatMap((v) => extractJsonStrings(v, depth + 1));
  }
  return [];
}

// ── YAML/TOML extractor ────────────────────────────────────────────

const yamlExtractor: Extractor = {
  extensions: [".yaml", ".yml", ".toml"],
  artifactType: "yaml",
  extractTitle(_filePath, content) {
    // Look for name: or title: keys
    const match = content.match(/^(?:name|title):\s*["']?(.+?)["']?\s*$/m);
    return match ? match[1].trim() : null;
  },
  extractSnippet(content, maxLen) {
    const lines = content.split("\n").filter((l) => l.trim() && !l.startsWith("#")).slice(0, 5);
    return lines.join(" ").slice(0, maxLen) || undefined;
  },
  extractText(content) {
    return content;
  },
};

// ── Code extractor ─────────────────────────────────────────────────

const CODE_EXTENSIONS = [
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rb", ".go", ".rs", ".java", ".kt",
  ".c", ".cpp", ".h", ".hpp", ".cs",
  ".sh", ".bash", ".zsh", ".fish",
  ".sql", ".graphql", ".gql",
  ".xml", ".xsl",
  ".swift", ".m",
  ".lua", ".r", ".pl",
  ".dockerfile",
];

const codeExtractor: Extractor = {
  extensions: CODE_EXTENSIONS,
  artifactType: "code",
  extractTitle(_filePath, content) {
    // Try to find a top-level class, function, or module doc
    const head = content.slice(0, 1000);
    // Python/Ruby docstring or class
    const pyClass = head.match(/^class\s+(\w+)/m);
    if (pyClass) return pyClass[1];
    // JS/TS export default function/class
    const jsExport = head.match(/export\s+(?:default\s+)?(?:function|class)\s+(\w+)/);
    if (jsExport) return jsExport[1];
    return null;
  },
  extractSnippet(content, maxLen) {
    // Strip comments and blank lines, show first meaningful lines
    const lines = content.split("\n")
      .filter((l) => l.trim() && !l.trim().startsWith("//") && !l.trim().startsWith("#") && !l.trim().startsWith("*"))
      .slice(0, 5);
    return lines.join(" ").slice(0, maxLen) || undefined;
  },
  extractText(content) {
    return content;
  },
};

// ── PDF extractor ──────────────────────────────────────────────────

const pdfExtractor: Extractor = {
  extensions: [".pdf"],
  artifactType: "pdf",
  extractTitle(_filePath, content) {
    // content will be empty for binary files — title extracted at scan time
    return null;
  },
  extractSnippet(content, maxLen) {
    return content.slice(0, maxLen) || undefined;
  },
  extractText(content) {
    return content;
  },
};

// ── Registry ───────────────────────────────────────────────────────

const ALL_EXTRACTORS: Extractor[] = [
  markdownExtractor,
  htmlExtractor,
  svgExtractor,
  csvExtractor,
  textExtractor,
  jsonExtractor,
  yamlExtractor,
  codeExtractor,
  pdfExtractor,
];

const extensionMap = new Map<string, Extractor>();
for (const extractor of ALL_EXTRACTORS) {
  for (const ext of extractor.extensions) {
    extensionMap.set(ext, extractor);
  }
}

export function getExtractor(filePath: string): Extractor | null {
  const ext = path.extname(filePath).toLowerCase();
  // Handle Dockerfile (no extension)
  if (path.basename(filePath).toLowerCase() === "dockerfile") return codeExtractor;
  return extensionMap.get(ext) || null;
}

export function getSupportedExtensions(): string[] {
  return Array.from(extensionMap.keys());
}

export function isSupported(filePath: string): boolean {
  return getExtractor(filePath) !== null;
}

/**
 * Read a PDF file and extract text. Returns empty string if pdf-parse
 * is not available or the file can't be read.
 */
export async function extractPdfText(filePath: string): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text || "";
  } catch {
    return "";
  }
}
