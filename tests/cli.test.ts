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
