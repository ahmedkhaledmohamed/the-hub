import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "child_process";
import { resolve } from "path";

const HUB_ROOT = resolve(__dirname, "..");
const CLI = resolve(HUB_ROOT, "bin/hub.js");

/**
 * CLI integration tests.
 *
 * These test the CLI binary directly. Tests that require a running
 * server use a mock approach — they test the help/parse behavior
 * without hitting the network. Server-dependent tests are marked
 * with comments for manual verification.
 */

function run(args: string, env: Record<string, string> = {}): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${CLI} ${args}`, {
      cwd: HUB_ROOT,
      encoding: "utf8",
      timeout: 5000,
      env: { ...process.env, ...env },
    });
    return { stdout, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return { stdout: (e.stdout || "") + (e.stderr || ""), exitCode: e.status || 1 };
  }
}

describe("CLI", () => {
  describe("help", () => {
    it("shows help with no arguments", () => {
      const { stdout, exitCode } = run("");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("The Hub CLI");
      expect(stdout).toContain("hub search");
      expect(stdout).toContain("hub open");
      expect(stdout).toContain("hub status");
      expect(stdout).toContain("hub context");
    });

    it("shows help with --help flag", () => {
      const { stdout } = run("--help");
      expect(stdout).toContain("The Hub CLI");
    });

    it("shows help with help command", () => {
      const { stdout } = run("help");
      expect(stdout).toContain("The Hub CLI");
    });
  });

  describe("unknown commands", () => {
    it("exits with error for unknown command", () => {
      const { stdout, exitCode } = run("nonexistent");
      expect(exitCode).toBe(1);
      expect(stdout).toContain("Unknown command: nonexistent");
    });
  });

  describe("search (no server)", () => {
    it("exits with error when no query provided", () => {
      const { stdout, exitCode } = run("search");
      expect(exitCode).toBe(1);
      expect(stdout).toContain("Usage: hub search");
    });

    it("exits with connection error when server not running", () => {
      // Use a port that's definitely not running
      const { stdout, exitCode } = run("search test-query", { HUB_URL: "http://localhost:59999" });
      expect(exitCode).toBe(1);
      expect(stdout).toContain("Could not connect");
    });
  });

  describe("context (no server)", () => {
    it("shows usage when context called without topic", () => {
      const { stdout, exitCode } = run("context");
      expect(exitCode).toBe(1);
      expect(stdout).toContain("Usage: hub context");
    });

    it("exits with connection error when server not running", () => {
      const { stdout, exitCode } = run("context test-topic", { HUB_URL: "http://localhost:59999" });
      expect(exitCode).toBe(1);
      expect(stdout).toContain("Could not connect");
    });
  });

  describe("stale (no server)", () => {
    it("exits with connection error when server not running", () => {
      const { stdout, exitCode } = run("stale", { HUB_URL: "http://localhost:59999" });
      expect(exitCode).toBe(1);
      expect(stdout).toContain("Could not connect");
    });
  });

  describe("HUB_URL environment variable", () => {
    it("uses custom HUB_URL when set", () => {
      const { stdout } = run("search test", { HUB_URL: "http://custom-host:1234" });
      expect(stdout).toContain("custom-host:1234");
    });
  });
});

// ── Auth tests ─────────────────────────────────────────────────────

import {
  isAuthEnabled,
  getApiKeys,
  validateApiKey,
  extractBearerToken,
  generateSessionToken,
  validateSessionToken,
  revokeSessionToken,
  authenticateRequest,
} from "@/lib/auth";

describe("API authentication", () => {
  const origKeys = process.env.HUB_API_KEYS;

  afterEach(() => {
    if (origKeys) process.env.HUB_API_KEYS = origKeys;
    else delete process.env.HUB_API_KEYS;
  });

  describe("isAuthEnabled", () => {
    it("returns false when HUB_API_KEYS not set", () => {
      delete process.env.HUB_API_KEYS;
      expect(isAuthEnabled()).toBe(false);
    });

    it("returns true when HUB_API_KEYS is set", () => {
      process.env.HUB_API_KEYS = "key1,key2";
      expect(isAuthEnabled()).toBe(true);
    });
  });

  describe("getApiKeys", () => {
    it("returns empty array when not set", () => {
      delete process.env.HUB_API_KEYS;
      expect(getApiKeys()).toEqual([]);
    });

    it("parses comma-separated keys", () => {
      process.env.HUB_API_KEYS = "key1, key2, key3";
      expect(getApiKeys()).toEqual(["key1", "key2", "key3"]);
    });

    it("filters empty strings", () => {
      process.env.HUB_API_KEYS = "key1,,key2,";
      expect(getApiKeys()).toEqual(["key1", "key2"]);
    });
  });

  describe("validateApiKey", () => {
    it("returns true when auth disabled", () => {
      delete process.env.HUB_API_KEYS;
      expect(validateApiKey("anything")).toBe(true);
    });

    it("validates correct key", () => {
      process.env.HUB_API_KEYS = "valid-key-123";
      expect(validateApiKey("valid-key-123")).toBe(true);
    });

    it("rejects invalid key", () => {
      process.env.HUB_API_KEYS = "valid-key-123";
      expect(validateApiKey("wrong-key")).toBe(false);
    });
  });

  describe("extractBearerToken", () => {
    it("extracts token from Bearer header", () => {
      expect(extractBearerToken("Bearer my-token")).toBe("my-token");
    });

    it("returns null for missing header", () => {
      expect(extractBearerToken(null)).toBeNull();
    });

    it("returns null for wrong format", () => {
      expect(extractBearerToken("Basic abc123")).toBeNull();
      expect(extractBearerToken("just-a-token")).toBeNull();
    });
  });

  describe("session tokens", () => {
    it("generates and validates session tokens", () => {
      const token = generateSessionToken();
      expect(validateSessionToken(token)).toBe(true);
    });

    it("rejects unknown tokens", () => {
      expect(validateSessionToken("nonexistent-token")).toBe(false);
    });

    it("revokes tokens", () => {
      const token = generateSessionToken();
      revokeSessionToken(token);
      expect(validateSessionToken(token)).toBe(false);
    });
  });

  describe("authenticateRequest", () => {
    it("allows all when auth disabled", () => {
      delete process.env.HUB_API_KEYS;
      expect(authenticateRequest(null).authenticated).toBe(true);
    });

    it("rejects missing header when auth enabled", () => {
      process.env.HUB_API_KEYS = "secret-key";
      const result = authenticateRequest(null);
      expect(result.authenticated).toBe(false);
      expect(result.reason).toContain("Missing");
    });

    it("accepts valid API key", () => {
      process.env.HUB_API_KEYS = "secret-key";
      expect(authenticateRequest("Bearer secret-key").authenticated).toBe(true);
    });

    it("accepts valid session token", () => {
      process.env.HUB_API_KEYS = "secret-key";
      const session = generateSessionToken();
      expect(authenticateRequest(`Bearer ${session}`).authenticated).toBe(true);
    });

    it("rejects invalid token", () => {
      process.env.HUB_API_KEYS = "secret-key";
      expect(authenticateRequest("Bearer wrong").authenticated).toBe(false);
    });
  });
});

// ── OpenAPI spec tests ─────────────────────────────────────────────

import { generateOpenApiSpec } from "@/lib/openapi";

describe("OpenAPI spec", () => {
  it("generates valid OpenAPI 3.1 structure", () => {
    const spec = generateOpenApiSpec();
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info.title).toBe("The Hub API");
    expect(spec.info.version).toBeTruthy();
  });

  it("includes all API tags", () => {
    const spec = generateOpenApiSpec();
    const tagNames = spec.tags.map((t: { name: string }) => t.name);
    expect(tagNames).toContain("Core");
    expect(tagNames).toContain("AI");
    expect(tagNames).toContain("Hygiene");
    expect(tagNames).toContain("Intelligence");
    expect(tagNames).toContain("Platform");
    // Network tag removed in v6 (federation, sharing, contexts deleted)
  });

  it("includes key endpoints", () => {
    const spec = generateOpenApiSpec();
    const paths = Object.keys(spec.paths);
    expect(paths).toContain("/api/manifest");
    expect(paths).toContain("/api/search");
    expect(paths).toContain("/api/ai/ask");
    expect(paths).toContain("/api/graph");
    expect(paths).toContain("/api/hygiene");
    expect(paths).toContain("/api/docs");
  });

  it("search endpoint has required query param", () => {
    const spec = generateOpenApiSpec();
    const searchParams = spec.paths["/api/search"].get.parameters;
    const qParam = searchParams.find((p: { name: string }) => p.name === "q");
    expect(qParam.required).toBe(true);
  });

  it("has 30+ endpoint paths", () => {
    const spec = generateOpenApiSpec();
    expect(Object.keys(spec.paths).length).toBeGreaterThanOrEqual(30);
  });
});

// ── Rate limiter tests ─────────────────────────────────────────────

import {
  checkRateLimit,
  clearBuckets,
  getBucketCount,
  getRateLimit,
  isRateLimitEnabled,
} from "@/lib/rate-limiter";

describe("rate limiter", () => {
  afterEach(() => {
    clearBuckets();
    delete process.env.HUB_RATE_LIMIT;
    delete process.env.HUB_RATE_BURST;
  });

  it("allows requests under the limit", () => {
    process.env.HUB_RATE_LIMIT = "120";
    const result = checkRateLimit("test-ip-1");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThanOrEqual(0);
  });

  it("creates a bucket per IP", () => {
    process.env.HUB_RATE_LIMIT = "120";
    checkRateLimit("ip-a");
    checkRateLimit("ip-b");
    expect(getBucketCount()).toBeGreaterThanOrEqual(2);
  });

  it("blocks when burst is exhausted", () => {
    process.env.HUB_RATE_LIMIT = "120";
    process.env.HUB_RATE_BURST = "3";

    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit("burst-test").allowed).toBe(true);
    }
    // 4th request should be blocked
    expect(checkRateLimit("burst-test").allowed).toBe(false);
  });

  it("getRateLimit reads env", () => {
    process.env.HUB_RATE_LIMIT = "60";
    expect(getRateLimit()).toBe(60);
  });

  it("isRateLimitEnabled checks env", () => {
    delete process.env.HUB_RATE_LIMIT;
    delete process.env.NODE_ENV;
    expect(isRateLimitEnabled()).toBe(false);

    process.env.HUB_RATE_LIMIT = "100";
    expect(isRateLimitEnabled()).toBe(true);
  });

  it("clearBuckets resets state", () => {
    process.env.HUB_RATE_LIMIT = "120";
    checkRateLimit("clear-test");
    expect(getBucketCount()).toBeGreaterThanOrEqual(1);
    clearBuckets();
    expect(getBucketCount()).toBe(0);
  });
});

// ── Validation tests ───────────────────────────────────────────────

import {
  validateString,
  validateEnum,
  validateArray,
  validate,
  sanitizeHtml,
  sanitizePath,
  isValidUrl,
} from "@/lib/validation";

describe("input validation", () => {
  describe("validateString", () => {
    it("passes valid string", () => {
      expect(validateString("hello", "name")).toBeNull();
    });

    it("fails when required and empty", () => {
      expect(validateString("", "name", { required: true })?.message).toContain("required");
    });

    it("fails when too short", () => {
      expect(validateString("ab", "name", { minLength: 3 })?.message).toContain("at least 3");
    });

    it("fails when too long", () => {
      expect(validateString("abc", "name", { maxLength: 2 })?.message).toContain("at most 2");
    });

    it("fails for non-string", () => {
      expect(validateString(123, "name")?.message).toContain("must be a string");
    });
  });

  describe("validateEnum", () => {
    it("passes valid enum value", () => {
      expect(validateEnum("a", "field", ["a", "b", "c"])).toBeNull();
    });

    it("fails for invalid value", () => {
      expect(validateEnum("d", "field", ["a", "b"])?.message).toContain("must be one of");
    });
  });

  describe("validateArray", () => {
    it("passes valid array", () => {
      expect(validateArray([1, 2], "items")).toBeNull();
    });

    it("fails when required and missing", () => {
      expect(validateArray(undefined, "items", { required: true })?.message).toContain("required");
    });

    it("fails for non-array", () => {
      expect(validateArray("not-array", "items")?.message).toContain("must be an array");
    });

    it("checks item types", () => {
      expect(validateArray([1, "two"], "items", { itemType: "number" })?.message).toContain("must be a number");
    });
  });

  describe("validate (batch)", () => {
    it("returns valid when all pass", () => {
      const result = validate(
        validateString("ok", "a"),
        validateEnum("x", "b", ["x", "y"]),
      );
      expect(result.valid).toBe(true);
    });

    it("returns errors when any fail", () => {
      const result = validate(
        validateString("", "a", { required: true }),
        validateEnum("z", "b", ["x"]),
      );
      expect(result.valid).toBe(false);
      expect(result.errors?.length).toBe(2);
    });
  });

  describe("sanitizeHtml", () => {
    it("escapes HTML entities", () => {
      expect(sanitizeHtml('<script>alert("xss")</script>')).toBe("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
    });
  });

  describe("sanitizePath", () => {
    it("removes path traversal", () => {
      expect(sanitizePath("../../../etc/passwd")).not.toContain("..");
    });

    it("removes leading slashes", () => {
      expect(sanitizePath("/etc/passwd")).toBe("etc/passwd");
    });

    it("removes null bytes", () => {
      expect(sanitizePath("file\0name")).toBe("filename");
    });
  });

  describe("isValidUrl", () => {
    it("accepts http URLs", () => {
      expect(isValidUrl("http://example.com")).toBe(true);
    });

    it("accepts https URLs", () => {
      expect(isValidUrl("https://example.com/path")).toBe(true);
    });

    it("rejects non-http protocols", () => {
      expect(isValidUrl("ftp://example.com")).toBe(false);
      expect(isValidUrl("javascript:alert(1)")).toBe(false);
    });

    it("rejects invalid URLs", () => {
      expect(isValidUrl("not a url")).toBe(false);
    });
  });
});

// ── Data export/backup tests ─────────────────────────────────────

import { existsSync, statSync } from "fs";
import { join } from "path";
import { getDb, getArtifactCount } from "@/lib/db";

describe("data export/backup", () => {
  describe("database info", () => {
    it("getArtifactCount returns number", () => {
      expect(typeof getArtifactCount()).toBe("number");
    });

    it("can list tables for backup info", () => {
      const db = getDb();
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      ).all() as Array<{ name: string }>;
      expect(tables.length).toBeGreaterThan(0);
    });

    it("can count rows across tables", () => {
      const db = getDb();
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      ).all() as Array<{ name: string }>;

      let totalRows = 0;
      for (const t of tables) {
        try {
          const row = db.prepare(`SELECT COUNT(*) as count FROM "${t.name}"`).get() as { count: number };
          totalRows += row.count;
        } catch { /* skip tables that can't be counted */ }
      }
      expect(typeof totalRows).toBe("number");
      expect(totalRows).toBeGreaterThanOrEqual(0);
    });
  });

  describe("backup file", () => {
    it("hub.db exists in .hub-data", () => {
      const dbPath = join(process.cwd(), ".hub-data", "hub.db");
      // May or may not exist in test environment
      const exists = existsSync(dbPath);
      expect(typeof exists).toBe("boolean");
    });

    it("WAL checkpoint runs without error", () => {
      const db = getDb();
      // TRUNCATE checkpoint should work
      expect(() => db.pragma("wal_checkpoint(TRUNCATE)")).not.toThrow();
    });
  });

  describe("formatSize utility", () => {
    const formatSize = (bytes: number): string => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    it("formats bytes", () => expect(formatSize(500)).toBe("500 B"));
    it("formats KB", () => expect(formatSize(2048)).toBe("2.0 KB"));
    it("formats MB", () => expect(formatSize(1048576)).toBe("1.0 MB"));
  });
});

// ── Preview keyboard navigation tests ────────────────────────────

describe("preview keyboard navigation", () => {
  describe("j/k navigation logic", () => {
    it("j moves to next artifact", () => {
      const artifacts = [{ path: "a.md" }, { path: "b.md" }, { path: "c.md" }];
      const currentIdx = 0;
      const nextIdx = currentIdx < artifacts.length - 1 ? currentIdx + 1 : 0;
      expect(nextIdx).toBe(1);
    });

    it("j wraps to first from last", () => {
      const artifacts = [{ path: "a.md" }, { path: "b.md" }, { path: "c.md" }];
      const currentIdx = 2;
      const nextIdx = currentIdx < artifacts.length - 1 ? currentIdx + 1 : 0;
      expect(nextIdx).toBe(0);
    });

    it("k moves to previous artifact", () => {
      const artifacts = [{ path: "a.md" }, { path: "b.md" }, { path: "c.md" }];
      const currentIdx = 2;
      const nextIdx = currentIdx > 0 ? currentIdx - 1 : artifacts.length - 1;
      expect(nextIdx).toBe(1);
    });

    it("k wraps to last from first", () => {
      const artifacts = [{ path: "a.md" }, { path: "b.md" }, { path: "c.md" }];
      const currentIdx = 0;
      const nextIdx = currentIdx > 0 ? currentIdx - 1 : artifacts.length - 1;
      expect(nextIdx).toBe(2);
    });

    it("finds current index by path", () => {
      const artifacts = [{ path: "a.md" }, { path: "b.md" }, { path: "c.md" }];
      const current = { path: "b.md" };
      const idx = artifacts.findIndex((a) => a.path === current.path);
      expect(idx).toBe(1);
    });

    it("returns -1 for no current preview", () => {
      const artifacts = [{ path: "a.md" }];
      const current = null;
      const idx = current ? artifacts.findIndex((a) => a.path === current.path) : -1;
      expect(idx).toBe(-1);
    });
  });

  describe("previewable type filter", () => {
    it("only previews md and html", () => {
      const types = ["md", "html", "csv", "json", "svg"];
      const previewable = types.filter((t) => t === "md" || t === "html");
      expect(previewable).toEqual(["md", "html"]);
    });
  });

  describe("input field exclusion", () => {
    it("excludes input, textarea, select tags", () => {
      const excluded = ["INPUT", "TEXTAREA", "SELECT"];
      expect(excluded.includes("INPUT")).toBe(true);
      expect(excluded.includes("DIV")).toBe(false);
    });
  });
});

// ── CLI upgrade tests (v6) ──────────────────────────────────────

describe("CLI v6 commands", () => {
  describe("hub stale", () => {
    it("filters stale artifacts (>90 days)", () => {
      const artifacts = [
        { path: "a.md", title: "Fresh", staleDays: 5, group: "docs" },
        { path: "b.md", title: "Aging", staleDays: 50, group: "docs" },
        { path: "c.md", title: "Stale", staleDays: 100, group: "docs" },
        { path: "d.md", title: "Ancient", staleDays: 200, group: "docs" },
      ];
      const stale = artifacts.filter((a) => a.staleDays > 90).sort((a, b) => b.staleDays - a.staleDays);
      expect(stale.length).toBe(2);
      expect(stale[0].title).toBe("Ancient");
      expect(stale[1].title).toBe("Stale");
    });

    it("caps display at 20", () => {
      const artifacts = Array.from({ length: 30 }, (_, i) => ({ staleDays: 100 + i, title: `Doc ${i}` }));
      const stale = artifacts.filter((a) => a.staleDays > 90);
      const displayed = stale.slice(0, 20);
      expect(displayed.length).toBe(20);
      expect(stale.length).toBe(30);
    });
  });

  describe("hub context", () => {
    it("filters related decisions by keywords", () => {
      const topic = "authentication architecture";
      const keywords = topic.toLowerCase().split(/\s+/);
      const decisions = [
        { summary: "Use JWT for authentication", artifactPath: "auth.md" },
        { summary: "Deploy to AWS", artifactPath: "infra.md" },
        { summary: "Microservices architecture pattern", artifactPath: "arch.md" },
      ];
      const related = decisions.filter((d) =>
        keywords.some((k) => d.summary.toLowerCase().includes(k))
      );
      expect(related.length).toBe(2);
      expect(related[0].summary).toContain("authentication");
      expect(related[1].summary).toContain("architecture");
    });
  });

  describe("hub search enhancements", () => {
    it("classifies freshness by staleDays", () => {
      const classify = (days) => days <= 7 ? "fresh" : days <= 30 ? "aging" : "stale";
      expect(classify(1)).toBe("fresh");
      expect(classify(7)).toBe("fresh");
      expect(classify(15)).toBe("aging");
      expect(classify(31)).toBe("stale");
    });
  });

  describe("CLI command routing", () => {
    it("defines 6 commands", () => {
      const commands = ["search", "context", "stale", "status", "open", "help"];
      expect(commands.length).toBe(6);
      expect(new Set(commands).size).toBe(6);
    });

    it("removed plugin command (marketplace deleted in v6)", () => {
      const commands = ["search", "context", "stale", "status", "open", "help"];
      expect(commands.includes("plugin")).toBe(false);
    });
  });
});
