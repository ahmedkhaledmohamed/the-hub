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
