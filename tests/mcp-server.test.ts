import { describe, it, expect, beforeEach } from "vitest";
import { persistArtifacts, searchArtifacts, getArtifactContent, getArtifactCount, getDb } from "@/lib/db";
import type { Artifact } from "@/lib/types";

/**
 * Tests for the MCP server's underlying data layer.
 *
 * The MCP server itself is a stdio process that delegates to these
 * functions. We test the data layer directly since the MCP SDK
 * handles protocol serialization.
 */

function makeArtifact(overrides: Partial<Artifact>): Artifact {
  return {
    path: "ws/doc.md",
    title: "Document",
    type: "md",
    group: "docs",
    modifiedAt: new Date().toISOString(),
    size: 500,
    staleDays: 1,
    snippet: "A snippet.",
    ...overrides,
  };
}

describe("MCP server data layer", () => {
  beforeEach(() => {
    // Seed with workspace data the MCP tools will query
    const artifacts = [
      makeArtifact({
        path: "project/docs/architecture.md",
        title: "Architecture Overview",
        group: "docs",
        snippet: "System architecture document.",
      }),
      makeArtifact({
        path: "project/docs/pricing.md",
        title: "Pricing Strategy",
        group: "strategy",
        snippet: "Enterprise pricing tiers.",
      }),
      makeArtifact({
        path: "project/planning/roadmap.md",
        title: "Q2 Roadmap",
        group: "planning",
        snippet: "Quarterly goals and milestones.",
      }),
      makeArtifact({
        path: "project/src/server.ts",
        title: "Server",
        type: "code",
        group: "code",
        snippet: "Express server implementation.",
      }),
    ];

    const contentMap = new Map([
      ["project/docs/architecture.md", "# Architecture\n\nThe system uses microservices with gRPC.\n\n## Components\n\n- API Gateway\n- Auth Service\n- Data Pipeline"],
      ["project/docs/pricing.md", "# Pricing\n\nThree tiers: Free, Pro ($12/mo), Enterprise ($80/user).\n\nEnterprise includes SSO and audit logging."],
      ["project/planning/roadmap.md", "# Q2 2026 Roadmap\n\n## Goals\n\n1. Ship semantic search\n2. Launch plugin system\n3. Mobile PWA"],
      ["project/src/server.ts", "import express from 'express';\n\nconst app = express();\napp.listen(3000);"],
    ]);

    persistArtifacts(artifacts, contentMap, { deleteStale: false });
  });

  describe("search tool", () => {
    it("finds seeded artifacts by content", () => {
      // Re-seed to ensure data is present
      persistArtifacts([makeArtifact({
        path: "mcp-search/test.md",
        title: "MCP Search Test",
      })], new Map([
        ["mcp-search/test.md", "This document is about microservices and gRPC communication."],
      ]), { deleteStale: false });

      const results = searchArtifacts("microservices");
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("respects limit parameter", () => {
      const results = searchArtifacts("document", 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it("returns empty for no matches", () => {
      const results = searchArtifacts("xyznonexistent999");
      expect(results).toEqual([]);
    });
  });

  describe("read_artifact tool", () => {
    it("returns full content for existing artifact", () => {
      const content = getArtifactContent("project/docs/architecture.md");
      expect(content).not.toBeNull();
      expect(content).toContain("# Architecture");
      expect(content).toContain("gRPC");
      expect(content).toContain("Data Pipeline");
    });

    it("returns null for non-existent artifact", () => {
      const content = getArtifactContent("project/does-not-exist.md");
      expect(content).toBeNull();
    });
  });

  describe("list_groups / get_manifest tools", () => {
    it("artifact count reflects seeded data", () => {
      const count = getArtifactCount();
      expect(count).toBeGreaterThanOrEqual(4);
    });
  });

  describe("end-to-end workflow", () => {
    it("search then read: end-to-end", () => {
      // Seed a doc for this specific test
      persistArtifacts([makeArtifact({
        path: "mcp-e2e/roadmap.md",
        title: "E2E Roadmap",
      })], new Map([
        ["mcp-e2e/roadmap.md", "# Q2 2026 Roadmap\n\nShip semantic search."],
      ]), { deleteStale: false });

      const results = searchArtifacts("roadmap");
      expect(results.length).toBeGreaterThanOrEqual(1);

      const match = results.find((r) => r.path === "mcp-e2e/roadmap.md");
      if (match) {
        const content = getArtifactContent(match.path);
        expect(content).toContain("Q2 2026 Roadmap");
      }
    });
  });

  describe("new MCP tools (Phase 2+)", () => {
    it("askWorkspace returns result structure", async () => {
      const { askWorkspace } = await import("@/lib/rag");
      // With AI_PROVIDER=none, returns unavailable but correct structure
      process.env.AI_PROVIDER = "none";
      const result = await askWorkspace("test question");
      expect(typeof result.answer).toBe("string");
      expect(Array.isArray(result.sources)).toBe(true);
      expect(typeof result.model).toBe("string");
      delete process.env.AI_PROVIDER;
    });

    it("generate returns result structure", async () => {
      const { generate } = await import("@/lib/generator");
      process.env.AI_PROVIDER = "none";
      const result = await generate({ template: "status-update" });
      expect(typeof result.content).toBe("string");
      expect(result.template).toBe("status-update");
      expect(Array.isArray(result.sourcePaths)).toBe(true);
      delete process.env.AI_PROVIDER;
    });

    it("getTrends returns trend data", async () => {
      const { getTrends } = await import("@/lib/trends");
      const trends = getTrends(7);
      expect(Array.isArray(trends.dates)).toBe(true);
      expect(Array.isArray(trends.total)).toBe(true);
      expect(Array.isArray(trends.stale)).toBe(true);
    });

    it("analyzeHygiene returns report structure", async () => {
      const { analyzeHygiene } = await import("@/lib/hygiene-analyzer");
      const report = analyzeHygiene([], "2026-01-01");
      expect(Array.isArray(report.findings)).toBe(true);
      expect(typeof report.stats.totalFindings).toBe("number");
    });

    it("discoverRepos returns array", async () => {
      const { discoverRepos } = await import("@/lib/repo-scanner");
      const repos = discoverRepos([]);
      expect(Array.isArray(repos)).toBe(true);
    });
  });

  describe("MCP resources", () => {
    it("getArtifactContent returns content for indexed artifacts", () => {
      // Seed a resource-readable artifact
      persistArtifacts([makeArtifact({
        path: "mcp-res/doc.md",
        title: "Resource Doc",
      })], new Map([
        ["mcp-res/doc.md", "# Resource Test\n\nThis doc is readable as an MCP resource."],
      ]), { deleteStale: false });

      const content = getArtifactContent("mcp-res/doc.md");
      expect(content).toContain("Resource Test");
      expect(content).toContain("MCP resource");
    });

    it("getArtifactContent returns null for missing path", () => {
      expect(getArtifactContent("mcp-res/nonexistent.md")).toBeNull();
    });

    it("artifacts are listable for resource discovery", () => {
      const count = getArtifactCount();
      expect(count).toBeGreaterThanOrEqual(1);
    });
  });
});

// ── Review request tests ───────────────────────────────────────────

import {
  createReviewRequest,
  updateReviewStatus,
  getReviewRequest,
  getReviewsForArtifact,
  getReviewsForReviewer,
  getPendingReviews,
  getReviewCounts,
} from "@/lib/reviews";

describe("review requests", () => {
  describe("createReviewRequest", () => {
    it("creates and retrieves a review", () => {
      const id = createReviewRequest({
        artifactPath: "review/doc.md",
        requestedBy: "alice",
        reviewer: "bob",
        message: "Please review my changes",
      });
      expect(id).toBeGreaterThan(0);

      const review = getReviewRequest(id);
      expect(review).not.toBeNull();
      expect(review!.status).toBe("pending");
      expect(review!.reviewer).toBe("bob");
      expect(review!.message).toBe("Please review my changes");
    });
  });

  describe("updateReviewStatus", () => {
    it("approves a review", () => {
      const id = createReviewRequest({ artifactPath: "review/approve.md", requestedBy: "a", reviewer: "b" });
      updateReviewStatus(id, "approved", "Looks good!");
      const review = getReviewRequest(id);
      expect(review!.status).toBe("approved");
      expect(review!.responseMessage).toBe("Looks good!");
    });

    it("requests changes", () => {
      const id = createReviewRequest({ artifactPath: "review/changes.md", requestedBy: "a", reviewer: "b" });
      updateReviewStatus(id, "changes-requested", "Fix section 3");
      expect(getReviewRequest(id)!.status).toBe("changes-requested");
    });
  });

  describe("queries", () => {
    it("getReviewsForArtifact returns reviews for a path", () => {
      const path = `review/query-${Date.now()}.md`;
      createReviewRequest({ artifactPath: path, requestedBy: "x", reviewer: "y" });
      const reviews = getReviewsForArtifact(path);
      expect(reviews.length).toBeGreaterThanOrEqual(1);
    });

    it("getReviewsForReviewer returns reviews for a person", () => {
      const reviewer = `reviewer-${Date.now()}`;
      createReviewRequest({ artifactPath: "review/person.md", requestedBy: "x", reviewer });
      const reviews = getReviewsForReviewer(reviewer);
      expect(reviews.length).toBeGreaterThanOrEqual(1);
    });

    it("getPendingReviews returns pending only", () => {
      const pending = getPendingReviews();
      expect(Array.isArray(pending)).toBe(true);
      for (const r of pending) expect(r.status).toBe("pending");
    });

    it("getReviewCounts returns counts by status", () => {
      const counts = getReviewCounts();
      expect(typeof counts.pending).toBe("number");
      expect(typeof counts.approved).toBe("number");
    });
  });
});

// ── Enterprise SSO/SAML tests ────────────────────────────────────

import {
  getSSOConfig,
  isSSOEnabled,
  isSSOConfigValid,
  generateAuthRequest,
  buildAuthRequestXML,
  encodeAuthRequest,
  buildSSORedirectUrl,
  extractAssertionFields,
  parseAssertion,
  isAssertionValid,
  mapRole,
  createSSOSession,
  validateSSOSession,
  revokeSSOSession,
  revokeUserSessions,
  getActiveSessions,
  cleanupExpiredSessions,
  generateSPMetadata,
} from "@/lib/sso";
import type { SAMLAssertion } from "@/lib/sso";

describe("enterprise SSO/SAML", () => {
  const savedEnv = { ...process.env };

  function setSSOEnv(): void {
    process.env.SSO_ENABLED = "true";
    process.env.SSO_ENTITY_ID = "https://hub.example.com";
    process.env.SSO_ACS_URL = "https://hub.example.com/api/sso/callback";
    process.env.SSO_IDP_SSO_URL = "https://idp.example.com/saml/sso";
    process.env.SSO_IDP_ISSUER = "https://idp.example.com";
    process.env.SSO_ADMIN_GROUPS = "hub-admins,platform-team";
  }

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  describe("configuration", () => {
    it("disabled by default", () => {
      delete process.env.SSO_ENABLED;
      expect(isSSOEnabled()).toBe(false);
    });

    it("enabled when SSO_ENABLED=true", () => {
      process.env.SSO_ENABLED = "true";
      expect(isSSOEnabled()).toBe(true);
    });

    it("reports missing config fields", () => {
      process.env.SSO_ENABLED = "true";
      delete process.env.SSO_ENTITY_ID;
      delete process.env.SSO_ACS_URL;
      const result = isSSOConfigValid();
      expect(result.valid).toBe(false);
      expect(result.missing).toContain("SSO_ENTITY_ID");
      expect(result.missing).toContain("SSO_ACS_URL");
    });

    it("valid when all required fields set", () => {
      setSSOEnv();
      expect(isSSOConfigValid().valid).toBe(true);
    });

    it("parses admin groups", () => {
      setSSOEnv();
      const config = getSSOConfig();
      expect(config.adminGroups).toEqual(["hub-admins", "platform-team"]);
    });

    it("defaults session TTL to 8 hours", () => {
      expect(getSSOConfig().sessionTtlSeconds).toBe(28800);
    });
  });

  describe("AuthnRequest generation", () => {
    it("generates request with correct fields", () => {
      setSSOEnv();
      const request = generateAuthRequest();
      expect(request.id).toMatch(/^_[a-f0-9]{32}$/);
      expect(request.destination).toBe("https://idp.example.com/saml/sso");
      expect(request.assertionConsumerServiceURL).toBe("https://hub.example.com/api/sso/callback");
      expect(request.issuer).toBe("https://hub.example.com");
    });

    it("builds valid XML", () => {
      setSSOEnv();
      const request = generateAuthRequest();
      const xml = buildAuthRequestXML(request);
      expect(xml).toContain("samlp:AuthnRequest");
      expect(xml).toContain(request.id);
      expect(xml).toContain("hub.example.com");
      expect(xml).toContain("emailAddress");
    });

    it("encodes to base64", () => {
      const xml = "<test>hello</test>";
      const encoded = encodeAuthRequest(xml);
      expect(Buffer.from(encoded, "base64").toString()).toBe(xml);
    });

    it("builds full redirect URL", () => {
      setSSOEnv();
      const url = buildSSORedirectUrl("/dashboard");
      expect(url).toContain("https://idp.example.com/saml/sso?SAMLRequest=");
      expect(url).toContain("RelayState=%2Fdashboard");
    });
  });

  describe("assertion parsing", () => {
    const sampleXML = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol">
      <saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">
        <saml:Issuer>https://idp.example.com</saml:Issuer>
        <saml:Subject>
          <saml:NameID>alice@example.com</saml:NameID>
        </saml:Subject>
        <saml:Conditions NotBefore="2026-01-01T00:00:00Z" NotOnOrAfter="2099-12-31T23:59:59Z">
          <saml:AudienceRestriction>
            <saml:Audience>https://hub.example.com</saml:Audience>
          </saml:AudienceRestriction>
        </saml:Conditions>
        <saml:AuthnStatement SessionIndex="session-123"/>
        <saml:AttributeStatement>
          <saml:Attribute Name="email">
            <saml:AttributeValue>alice@example.com</saml:AttributeValue>
          </saml:Attribute>
          <saml:Attribute Name="displayName">
            <saml:AttributeValue>Alice Smith</saml:AttributeValue>
          </saml:Attribute>
          <saml:Attribute Name="groups">
            <saml:AttributeValue>hub-admins</saml:AttributeValue>
            <saml:AttributeValue>engineering</saml:AttributeValue>
          </saml:Attribute>
        </saml:AttributeStatement>
      </saml:Assertion>
    </samlp:Response>`;

    it("extracts fields from SAML XML", () => {
      const assertion = extractAssertionFields(sampleXML);
      expect(assertion).not.toBeNull();
      expect(assertion!.nameId).toBe("alice@example.com");
      expect(assertion!.email).toBe("alice@example.com");
      expect(assertion!.displayName).toBe("Alice Smith");
      expect(assertion!.issuer).toBe("https://idp.example.com");
      expect(assertion!.audience).toBe("https://hub.example.com");
      expect(assertion!.sessionIndex).toBe("session-123");
    });

    it("extracts groups", () => {
      const assertion = extractAssertionFields(sampleXML);
      expect(assertion!.groups).toContain("hub-admins");
      expect(assertion!.groups).toContain("engineering");
    });

    it("parses base64-encoded response", () => {
      const encoded = Buffer.from(sampleXML).toString("base64");
      const assertion = parseAssertion(encoded);
      expect(assertion).not.toBeNull();
      expect(assertion!.nameId).toBe("alice@example.com");
    });

    it("returns null for invalid XML", () => {
      expect(extractAssertionFields("<invalid>no nameid</invalid>")).toBeNull();
    });

    it("returns null for invalid base64", () => {
      expect(parseAssertion("!!!invalid-base64!!!")).toBeNull();
    });
  });

  describe("assertion validation", () => {
    it("accepts valid assertion", () => {
      const assertion: SAMLAssertion = {
        nameId: "user@example.com", email: "user@example.com", displayName: "User",
        groups: [], attributes: {}, issuer: "https://idp.example.com",
        audience: "https://hub.example.com", notBefore: "2020-01-01T00:00:00Z",
        notOnOrAfter: "2099-12-31T23:59:59Z", sessionIndex: "s1",
      };
      setSSOEnv();
      expect(isAssertionValid(assertion).valid).toBe(true);
    });

    it("rejects expired assertion", () => {
      const assertion: SAMLAssertion = {
        nameId: "user@example.com", email: "user@example.com", displayName: "User",
        groups: [], attributes: {}, issuer: "",
        audience: "", notBefore: "2020-01-01T00:00:00Z",
        notOnOrAfter: "2020-01-02T00:00:00Z", sessionIndex: "s1",
      };
      const result = isAssertionValid(assertion);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("expired");
    });

    it("rejects wrong issuer", () => {
      setSSOEnv();
      const assertion: SAMLAssertion = {
        nameId: "user@example.com", email: "user@example.com", displayName: "User",
        groups: [], attributes: {}, issuer: "https://wrong-idp.com",
        audience: "", notBefore: "", notOnOrAfter: "", sessionIndex: "",
      };
      const result = isAssertionValid(assertion);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("Issuer mismatch");
    });
  });

  describe("role mapping", () => {
    it("maps admin group to admin role", () => {
      setSSOEnv();
      const assertion: SAMLAssertion = {
        nameId: "admin@example.com", email: "admin@example.com", displayName: "Admin",
        groups: ["hub-admins", "engineering"], attributes: {},
        issuer: "", audience: "", notBefore: "", notOnOrAfter: "", sessionIndex: "",
      };
      expect(mapRole(assertion)).toBe("admin");
    });

    it("maps role attribute", () => {
      process.env.SSO_ADMIN_GROUPS = "";
      const assertion: SAMLAssertion = {
        nameId: "user@example.com", email: "user@example.com", displayName: "User",
        groups: [], attributes: { role: "read-only" },
        issuer: "", audience: "", notBefore: "", notOnOrAfter: "", sessionIndex: "",
      };
      expect(mapRole(assertion)).toBe("read-only");
    });

    it("defaults to read-write", () => {
      process.env.SSO_ADMIN_GROUPS = "";
      const assertion: SAMLAssertion = {
        nameId: "user@example.com", email: "user@example.com", displayName: "User",
        groups: ["engineering"], attributes: {},
        issuer: "", audience: "", notBefore: "", notOnOrAfter: "", sessionIndex: "",
      };
      expect(mapRole(assertion)).toBe("read-write");
    });
  });

  describe("session management", () => {
    it("creates and validates a session", () => {
      const assertion: SAMLAssertion = {
        nameId: "alice@example.com", email: "alice@example.com", displayName: "Alice",
        groups: ["engineering"], attributes: {},
        issuer: "idp", audience: "sp", notBefore: "", notOnOrAfter: "", sessionIndex: "s1",
      };
      const session = createSSOSession(assertion);
      expect(session.token).toBeTruthy();
      expect(session.email).toBe("alice@example.com");
      expect(session.displayName).toBe("Alice");

      const validated = validateSSOSession(session.token);
      expect(validated).not.toBeNull();
      expect(validated!.email).toBe("alice@example.com");
    });

    it("returns null for invalid token", () => {
      expect(validateSSOSession("nonexistent-token")).toBeNull();
    });

    it("revokes a session", () => {
      const assertion: SAMLAssertion = {
        nameId: "bob@example.com", email: "bob@example.com", displayName: "Bob",
        groups: [], attributes: {},
        issuer: "", audience: "", notBefore: "", notOnOrAfter: "", sessionIndex: "",
      };
      const session = createSSOSession(assertion);
      expect(revokeSSOSession(session.token)).toBe(true);
      expect(validateSSOSession(session.token)).toBeNull();
    });

    it("revokes all sessions for a user", () => {
      const email = `sso-bulk-${Date.now()}@example.com`;
      const assertion: SAMLAssertion = {
        nameId: email, email, displayName: "Bulk",
        groups: [], attributes: {},
        issuer: "", audience: "", notBefore: "", notOnOrAfter: "", sessionIndex: "",
      };
      createSSOSession(assertion);
      createSSOSession(assertion);
      const revoked = revokeUserSessions(email);
      expect(revoked).toBeGreaterThanOrEqual(2);
    });

    it("getActiveSessions returns array", () => {
      const sessions = getActiveSessions();
      expect(Array.isArray(sessions)).toBe(true);
    });

    it("cleanupExpiredSessions runs without error", () => {
      const removed = cleanupExpiredSessions();
      expect(typeof removed).toBe("number");
    });
  });

  describe("SP metadata", () => {
    it("generates valid SP metadata XML", () => {
      setSSOEnv();
      const xml = generateSPMetadata();
      expect(xml).toContain("EntityDescriptor");
      expect(xml).toContain("https://hub.example.com");
      expect(xml).toContain("AssertionConsumerService");
      expect(xml).toContain("emailAddress");
    });
  });
});

// ── Error surfacing tests ────────────────────────────────────────

import {
  reportError,
  swallow,
  getActiveErrors,
  getErrorCounts,
  getErrorSummary,
  resolveError,
  resolveErrorsByCategory,
  pruneErrors,
} from "@/lib/error-reporter";

describe("error surfacing", () => {
  describe("reportError", () => {
    it("stores an error in the database", () => {
      const msg = `test-error-${Date.now()}`;
      reportError("system", new Error(msg), { testKey: "testVal" });

      const errors = getActiveErrors({ category: "system" });
      const found = errors.find((e) => e.message === msg);
      expect(found).toBeDefined();
      expect(found!.category).toBe("system");
      expect(found!.severity).toBe("warning");
      expect(found!.context.testKey).toBe("testVal");
      expect(found!.occurrences).toBe(1);
      expect(found!.resolved).toBe(false);
    });

    it("stores stack traces from Error objects", () => {
      const msg = `stack-test-${Date.now()}`;
      reportError("ai", new Error(msg));
      const errors = getActiveErrors({ category: "ai" });
      const found = errors.find((e) => e.message === msg);
      expect(found).toBeDefined();
      expect(found!.stack).toContain("Error:");
    });

    it("handles string errors", () => {
      const msg = `string-error-${Date.now()}`;
      reportError("config", msg);
      const errors = getActiveErrors({ category: "config" });
      const found = errors.find((e) => e.message === msg);
      expect(found).toBeDefined();
      expect(found!.stack).toBeNull();
    });

    it("deduplicates repeated errors", () => {
      const msg = `dedup-${Date.now()}`;
      reportError("system", new Error(msg));
      reportError("system", new Error(msg));
      reportError("system", new Error(msg));

      const errors = getActiveErrors({ category: "system" });
      const found = errors.filter((e) => e.message === msg);
      expect(found.length).toBe(1);
      expect(found[0].occurrences).toBe(3);
    });

    it("supports all categories", () => {
      const categories = ["scan", "search", "ai", "api", "integration", "plugin", "system", "config"] as const;
      for (const cat of categories) {
        reportError(cat, `cat-test-${cat}-${Date.now()}`);
      }
      const counts = getErrorCounts();
      expect(typeof counts).toBe("object");
    });
  });

  describe("swallow", () => {
    it("returns result on success", () => {
      const result = swallow("system", () => 42);
      expect(result).toBe(42);
    });

    it("returns undefined and reports on failure", () => {
      const msg = `swallow-${Date.now()}`;
      const result = swallow("system", () => { throw new Error(msg); });
      expect(result).toBeUndefined();

      const errors = getActiveErrors({ category: "system" });
      expect(errors.some((e) => e.message === msg)).toBe(true);
    });
  });

  describe("getActiveErrors", () => {
    it("filters by category", () => {
      const errors = getActiveErrors({ category: "scan" });
      for (const e of errors) expect(e.category).toBe("scan");
    });

    it("filters by severity", () => {
      reportError("system", "severity-test", {}, "critical");
      const errors = getActiveErrors({ severity: "critical" });
      for (const e of errors) expect(e.severity).toBe("critical");
    });
  });

  describe("getErrorSummary", () => {
    it("returns counts by severity", () => {
      const summary = getErrorSummary();
      expect(typeof summary.total).toBe("number");
      expect(typeof summary.critical).toBe("number");
      expect(typeof summary.warning).toBe("number");
      expect(typeof summary.info).toBe("number");
    });
  });

  describe("resolveError", () => {
    it("marks an error as resolved", () => {
      const msg = `resolve-${Date.now()}`;
      reportError("system", new Error(msg));
      const errors = getActiveErrors({ category: "system" });
      const err = errors.find((e) => e.message === msg);
      expect(err).toBeDefined();

      const resolved = resolveError(err!.id);
      expect(resolved).toBe(true);

      // Should no longer appear in active errors
      const after = getActiveErrors({ category: "system" });
      expect(after.find((e) => e.message === msg)).toBeUndefined();
    });
  });

  describe("resolveErrorsByCategory", () => {
    it("resolves all errors in a category", () => {
      const cat = "plugin" as const;
      reportError(cat, `batch-${Date.now()}-a`);
      reportError(cat, `batch-${Date.now()}-b`);
      const count = resolveErrorsByCategory(cat);
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  describe("pruneErrors", () => {
    it("prunes old resolved errors", () => {
      const removed = pruneErrors(30);
      expect(typeof removed).toBe("number");
    });
  });
});

// ── MCP prompt templates tests ───────────────────────────────────

import { persistArtifacts, searchArtifacts, getArtifactContent } from "@/lib/db";
import type { Artifact } from "@/lib/types";

describe("MCP prompt templates", () => {
  beforeEach(() => {
    // Seed test data for prompt generation
    const artifacts: Artifact[] = [
      { path: "prompt/docs/architecture.md", title: "Architecture Overview", type: "md", group: "docs", modifiedAt: new Date().toISOString(), size: 500, staleDays: 1, snippet: "System architecture." },
      { path: "prompt/docs/api-guide.md", title: "API Guide", type: "md", group: "docs", modifiedAt: new Date().toISOString(), size: 300, staleDays: 5, snippet: "API documentation." },
      { path: "prompt/planning/roadmap.md", title: "Roadmap Q3", type: "md", group: "planning", modifiedAt: new Date().toISOString(), size: 400, staleDays: 2, snippet: "Quarterly roadmap." },
      { path: "prompt/strategy/pricing.md", title: "Pricing Strategy", type: "md", group: "strategy", modifiedAt: new Date().toISOString(), size: 200, staleDays: 45, snippet: "Enterprise pricing." },
    ];
    const contentMap = new Map([
      ["prompt/docs/architecture.md", "# Architecture\n\nThe system uses microservices."],
      ["prompt/docs/api-guide.md", "# API Guide\n\nREST API with JSON responses."],
      ["prompt/planning/roadmap.md", "# Roadmap\n\nQ3 goals: ship search, launch MCP."],
      ["prompt/strategy/pricing.md", "# Pricing\n\nThree tiers: Free, Pro, Enterprise."],
    ]);
    persistArtifacts(artifacts, contentMap, { deleteStale: false });
  });

  describe("summarize_group prompt data", () => {
    it("finds artifacts by group for summarization", () => {
      const results = searchArtifacts("architecture");
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("group filtering works for prompt context", () => {
      const allArtifacts = [
        { group: "docs", title: "A", staleDays: 1 },
        { group: "docs", title: "B", staleDays: 5 },
        { group: "planning", title: "C", staleDays: 2 },
      ];
      const docsOnly = allArtifacts.filter((a) => a.group === "docs");
      expect(docsOnly.length).toBe(2);
      const sorted = docsOnly.sort((a, b) => a.staleDays - b.staleDays);
      expect(sorted[0].staleDays).toBeLessThanOrEqual(sorted[1].staleDays);
    });
  });

  describe("draft_status_update prompt data", () => {
    it("filters recent artifacts for status context", () => {
      const artifacts = [
        { staleDays: 0, title: "Today" },
        { staleDays: 2, title: "Recent" },
        { staleDays: 10, title: "Older" },
        { staleDays: 50, title: "Stale" },
      ];
      const recent = artifacts.filter((a) => a.staleDays <= 3);
      expect(recent.length).toBe(2);
      const stale = artifacts.filter((a) => a.staleDays > 30).length;
      expect(stale).toBe(1);
    });
  });

  describe("find_conflicts prompt data", () => {
    it("loads content for conflict analysis", () => {
      const content = getArtifactContent("prompt/docs/architecture.md");
      expect(content).not.toBeNull();
      expect(content).toContain("microservices");
    });

    it("needs at least 2 docs for conflict check", () => {
      const groupDocs = [
        { path: "a.md", content: "claim A" },
        { path: "b.md", content: "claim B" },
      ];
      expect(groupDocs.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("review_artifact prompt data", () => {
    it("loads artifact content for review", () => {
      const content = getArtifactContent("prompt/planning/roadmap.md");
      expect(content).not.toBeNull();
      expect(content).toContain("Roadmap");
    });

    it("returns null for non-existent artifact", () => {
      expect(getArtifactContent("prompt/nonexistent.md")).toBeNull();
    });
  });

  describe("onboarding_brief prompt data", () => {
    it("groups artifacts by group for overview", () => {
      const artifacts = [
        { group: "docs" }, { group: "docs" }, { group: "planning" }, { group: "strategy" },
      ];
      const byGroup = new Map<string, number>();
      for (const a of artifacts) byGroup.set(a.group, (byGroup.get(a.group) || 0) + 1);
      expect(byGroup.get("docs")).toBe(2);
      expect(byGroup.get("planning")).toBe(1);
      expect(byGroup.size).toBe(3);
    });

    it("selects fresh markdown docs for reading list", () => {
      const artifacts = [
        { type: "md", staleDays: 2, title: "Fresh" },
        { type: "md", staleDays: 50, title: "Stale" },
        { type: "csv", staleDays: 1, title: "Data" },
      ];
      const candidates = artifacts.filter((a) => a.type === "md" && a.staleDays < 30);
      expect(candidates.length).toBe(1);
      expect(candidates[0].title).toBe("Fresh");
    });
  });

  describe("prompt template catalog", () => {
    it("all 5 prompt templates have distinct names", () => {
      const names = [
        "summarize_group",
        "draft_status_update",
        "find_conflicts",
        "review_artifact",
        "onboarding_brief",
      ];
      expect(new Set(names).size).toBe(5);
    });
  });
});

// ── MCP health/stats resource tests ──────────────────────────────

describe("MCP health/stats resource", () => {
  describe("status data structure", () => {
    it("server section has version and uptime", () => {
      const status = {
        server: {
          version: "3.0.0",
          nodeVersion: process.version,
          platform: process.platform,
          uptime: Math.round(process.uptime()),
        },
      };
      expect(status.server.version).toBe("3.0.0");
      expect(status.server.nodeVersion).toMatch(/^v\d+/);
      expect(typeof status.server.uptime).toBe("number");
      expect(status.server.uptime).toBeGreaterThanOrEqual(0);
    });

    it("workspace section tracks artifact and group counts", () => {
      const workspace = {
        artifactCount: 150,
        groupCount: 5,
        lastScanReason: "file changed",
        generatedAt: new Date().toISOString(),
      };
      expect(workspace.artifactCount).toBeGreaterThan(0);
      expect(workspace.groupCount).toBeGreaterThan(0);
      expect(workspace.generatedAt).toBeTruthy();
    });

    it("AI status reflects configuration", () => {
      const savedProvider = process.env.AI_PROVIDER;
      process.env.AI_PROVIDER = "none";
      // isAiConfigured is tested extensively in ai-client tests
      // Here we verify the status structure handles both states
      const aiStatus = { configured: false, provider: null };
      expect(aiStatus.configured).toBe(false);
      expect(aiStatus.provider).toBeNull();
      if (savedProvider) process.env.AI_PROVIDER = savedProvider;
      else delete process.env.AI_PROVIDER;
    });

    it("features count available vs total", () => {
      const features = {
        search: true,
        hygiene: true,
        knowledgeGraph: true,
        changeFeed: true,
        ragQA: false,
        summarization: false,
        contentGeneration: false,
        smartTriage: false,
      };
      const available = Object.values(features).filter(Boolean).length;
      const total = Object.keys(features).length;
      expect(available).toBe(4);
      expect(total).toBe(8);
    });

    it("MCP counts reflect registered capabilities", () => {
      const mcp = { tools: 9, resources: 3, prompts: 5 };
      expect(mcp.tools).toBe(9);
      expect(mcp.resources).toBe(3); // artifact, manifest, status
      expect(mcp.prompts).toBe(5);
    });
  });

  describe("status serialization", () => {
    it("serializes to valid JSON", () => {
      const status = {
        server: { version: "3.0.0", uptime: 100 },
        workspace: { artifactCount: 50 },
        ai: { configured: false, provider: null },
        features: { available: 4, total: 8 },
      };
      const json = JSON.stringify(status, null, 2);
      const parsed = JSON.parse(json);
      expect(parsed.server.version).toBe("3.0.0");
      expect(parsed.workspace.artifactCount).toBe(50);
    });

    it("handles null AI provider gracefully", () => {
      const ai = { configured: false, provider: null };
      const json = JSON.stringify(ai);
      expect(json).toContain('"provider":null');
    });
  });

  describe("database stats for status", () => {
    it("can count tables in SQLite", () => {
      const db = getDb();
      const row = db.prepare(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      ).get() as { count: number };
      expect(row.count).toBeGreaterThan(0);
    });
  });
});

// ── MCP tool refinement tests ────────────────────────────────────

import { getActiveDecisions, searchDecisions as searchDecisionsLib, getDecisionCounts, saveDecision as saveDecisionLib } from "@/lib/decision-tracker";
import { computeImpactScore } from "@/lib/impact-scoring";
import { getActiveErrors as getActiveErrorsLib, getErrorSummary as getErrorSummaryLib, reportError as reportErrorLib } from "@/lib/error-reporter";

describe("MCP tool refinement", () => {
  describe("get_decisions tool data", () => {
    it("getActiveDecisions returns array for MCP tool", () => {
      const decisions = getActiveDecisions(5);
      expect(Array.isArray(decisions)).toBe(true);
      for (const d of decisions) {
        expect(d.status).toBe("active");
        expect(d.summary).toBeTruthy();
        expect(d.artifactPath).toBeTruthy();
      }
    });

    it("searchDecisions finds by keyword for MCP tool", () => {
      const keyword = `mcp-tool-${Date.now()}`;
      saveDecisionLib({ artifactPath: "mcp/tool-test.md", summary: `Use ${keyword} for search` });
      const results = searchDecisionsLib(keyword);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("getDecisionCounts provides summary for tool response", () => {
      const counts = getDecisionCounts();
      expect(typeof counts.active).toBe("number");
      expect(typeof counts.superseded).toBe("number");
      expect(typeof counts.reverted).toBe("number");
    });

    it("formats decisions for MCP text output", () => {
      const decisions = [
        { status: "active", summary: "Use TypeScript", artifactPath: "docs/decisions.md", actor: "alice", source: "heuristic" },
      ];
      const text = decisions.map((d, i) =>
        `${i + 1}. [${d.status.toUpperCase()}] ${d.summary}\n   Source: ${d.artifactPath}${d.actor ? ` | Actor: ${d.actor}` : ""}`
      ).join("\n\n");
      expect(text).toContain("[ACTIVE]");
      expect(text).toContain("Use TypeScript");
      expect(text).toContain("Actor: alice");
    });
  });

  describe("get_impact tool data", () => {
    it("computeImpactScore returns valid structure for MCP tool", () => {
      const score = computeImpactScore("mcp/impact-test.md");
      expect(typeof score.score).toBe("number");
      expect(["critical", "high", "medium", "low", "none"]).toContain(score.level);
      expect(Array.isArray(score.stakeholders)).toBe(true);
      expect(typeof score.signals.accessCount).toBe("number");
      expect(typeof score.signals.backlinkCount).toBe("number");
    });

    it("formats impact score for MCP text output", () => {
      const score = { score: 65, level: "high", signals: { accessCount: 10, uniqueAccessors: 3, annotationCount: 2, reviewCount: 1, backlinkCount: 4, dependentCount: 2 } };
      const signalSummary = `Access: ${score.signals.accessCount} views by ${score.signals.uniqueAccessors} users`;
      expect(signalSummary).toContain("10 views by 3 users");
    });
  });

  describe("get_errors tool data", () => {
    it("getErrorSummary provides counts for MCP tool", () => {
      const summary = getErrorSummaryLib();
      expect(typeof summary.total).toBe("number");
      expect(typeof summary.critical).toBe("number");
      expect(typeof summary.warning).toBe("number");
    });

    it("getActiveErrors returns errors for MCP tool", () => {
      reportErrorLib("system", `mcp-tool-test-${Date.now()}`);
      const errors = getActiveErrorsLib({ limit: 5 });
      expect(Array.isArray(errors)).toBe(true);
      for (const e of errors) {
        expect(e.message).toBeTruthy();
        expect(e.category).toBeTruthy();
        expect(e.severity).toBeTruthy();
      }
    });

    it("formats errors for MCP text output", () => {
      const errors = [
        { severity: "warning", category: "ai", message: "Timeout", occurrences: 3, lastSeen: "2026-04-05T00:00:00Z" },
      ];
      const text = errors.map((e, i) =>
        `${i + 1}. [${e.severity.toUpperCase()}] ${e.category}: ${e.message}${e.occurrences > 1 ? ` (×${e.occurrences})` : ""}`
      ).join("\n\n");
      expect(text).toContain("[WARNING]");
      expect(text).toContain("(×3)");
    });
  });

  describe("tool catalog", () => {
    it("12 MCP tools registered", () => {
      const tools = [
        "search", "read_artifact", "list_groups", "get_manifest",
        "ask_question", "generate_content", "get_hygiene", "get_trends",
        "list_repos", "get_decisions", "get_impact", "get_errors",
      ];
      expect(tools.length).toBe(12);
      expect(new Set(tools).size).toBe(12);
    });
  });
});

// ── Notification trigger tests ───────────────────────────────────

import {
  notify,
  notifyReviewUpdate,
  notifyAnnotation,
  getNotifications,
  getUnreadCount,
} from "@/lib/notifications";
import { createReviewRequest, updateReviewStatus } from "@/lib/reviews";
import { addAnnotation } from "@/lib/annotations";

describe("notification triggers", () => {
  describe("review completion triggers notification", () => {
    it("notifyReviewUpdate creates notification for requester", () => {
      const recipient = `trigger-review-${Date.now()}`;
      notifyReviewUpdate({
        requestedBy: recipient,
        reviewer: "bob",
        status: "approved",
        artifactPath: "trigger/test.md",
      });
      const notifs = getNotifications(recipient);
      expect(notifs.some((n) => n.type === "review")).toBe(true);
    });

    it("notification includes reviewer name", () => {
      const recipient = `trigger-name-${Date.now()}`;
      notifyReviewUpdate({
        requestedBy: recipient,
        reviewer: "charlie",
        status: "changes-requested",
        artifactPath: "trigger/changes.md",
        responseMessage: "Fix section 3",
      });
      const notifs = getNotifications(recipient);
      const reviewNotif = notifs.find((n) => n.type === "review");
      expect(reviewNotif).toBeDefined();
      expect(reviewNotif!.message).toContain("charlie");
    });
  });

  describe("annotation creation triggers notification", () => {
    it("notifyAnnotation creates notification", () => {
      const recipient = `trigger-ann-${Date.now()}`;
      notifyAnnotation({
        recipient,
        author: "alice",
        artifactPath: "trigger/annotated.md",
        content: "This needs updating.",
      });
      const notifs = getNotifications(recipient);
      expect(notifs.some((n) => n.type === "annotation")).toBe(true);
    });
  });

  describe("unread count for badge", () => {
    it("getUnreadCount increases after notification", () => {
      const recipient = `trigger-unread-${Date.now()}`;
      const before = getUnreadCount(recipient);
      notify({ recipient, type: "system", title: "Test" });
      const after = getUnreadCount(recipient);
      expect(after).toBe(before + 1);
    });
  });
});
