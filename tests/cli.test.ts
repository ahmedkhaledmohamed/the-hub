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
      expect(stdout).toContain("hub context compile");
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
    it("shows help when context called without compile", () => {
      const { stdout } = run("context");
      expect(stdout).toContain("The Hub CLI");
    });

    it("exits with error when --group missing", () => {
      const { stdout, exitCode } = run("context compile", { HUB_URL: "http://localhost:59999" });
      expect(exitCode).toBe(1);
      expect(stdout).toContain("Usage: hub context compile --group");
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

// ── Sharing tests ──────────────────────────────────────────────────

import {
  isSharingEnabled,
  getUserRole,
  getUserName,
  canWrite,
  canRead,
  canPerformAction,
  trackUserActivity,
  getRecentUserActivity,
  getUserActivityCount,
  getSharedUsers,
} from "@/lib/sharing";
import type { UserRole } from "@/lib/types";

describe("sharing", () => {
  describe("isSharingEnabled", () => {
    it("returns false when no sharing config", () => {
      expect(isSharingEnabled()).toBe(false);
    });
  });

  describe("getUserRole", () => {
    it("returns admin when sharing disabled", () => {
      expect(getUserRole(null)).toBe("admin");
    });

    it("returns admin when sharing disabled with key", () => {
      expect(getUserRole("some-key")).toBe("admin");
    });
  });

  describe("getUserName", () => {
    it("returns anonymous for null key", () => {
      expect(getUserName(null)).toBe("anonymous");
    });

    it("returns user for unknown key", () => {
      expect(getUserName("unknown-key")).toBe("user");
    });
  });

  describe("permissions", () => {
    it("admin can do everything", () => {
      expect(canWrite("admin")).toBe(true);
      expect(canRead("admin")).toBe(true);
      expect(canPerformAction("admin", "delete")).toBe(true);
    });

    it("read-write can write", () => {
      expect(canWrite("read-write")).toBe(true);
      expect(canRead("read-write")).toBe(true);
    });

    it("read-only cannot write", () => {
      expect(canWrite("read-only")).toBe(false);
      expect(canRead("read-only")).toBe(true);
      expect(canPerformAction("read-only", "delete")).toBe(false);
      expect(canPerformAction("read-only", "archive")).toBe(false);
    });

    it("read-only can read actions", () => {
      expect(canPerformAction("read-only", "search")).toBe(true);
      expect(canPerformAction("read-only", "view")).toBe(true);
    });

    it("anonymous cannot access", () => {
      expect(canWrite("anonymous")).toBe(false);
      expect(canRead("anonymous")).toBe(false);
    });
  });

  describe("user activity tracking", () => {
    it("tracks and retrieves activity", () => {
      trackUserActivity("test-user", "admin", "view", "/briefing");
      const recent = getRecentUserActivity(5);
      expect(recent.some((a) => a.userName === "test-user")).toBe(true);
    });

    it("counts activity per user", () => {
      const unique = `count-user-${Date.now()}`;
      trackUserActivity(unique, "admin", "search");
      trackUserActivity(unique, "admin", "view");
      expect(getUserActivityCount(unique, 1)).toBe(2);
    });
  });

  describe("getSharedUsers", () => {
    it("returns empty when no sharing config", () => {
      expect(getSharedUsers()).toEqual([]);
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
    expect(tagNames).toContain("Network");
  });

  it("includes key endpoints", () => {
    const spec = generateOpenApiSpec();
    const paths = Object.keys(spec.paths);
    expect(paths).toContain("/api/manifest");
    expect(paths).toContain("/api/search");
    expect(paths).toContain("/api/ai/ask");
    expect(paths).toContain("/api/graph");
    expect(paths).toContain("/api/federation");
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
