import { NextRequest, NextResponse } from "next/server";
import { isGoogleDocsConfigured, getAllLinkedDocs, getSyncSummary } from "@/lib/google-docs";
import { isNotionConfigured, getAllLinkedPages, getNotionSyncSummary } from "@/lib/notion-sync";

export const dynamic = "force-dynamic";

export interface IntegrationStatus {
  name: string;
  id: string;
  configured: boolean;
  envVars: Array<{ name: string; set: boolean; required: boolean }>;
  summary: Record<string, unknown>;
  actions: string[];
}

/**
 * GET /api/integrations — aggregated status of all integrations
 */
export async function GET() {
  const integrations: IntegrationStatus[] = [
    {
      name: "Google Docs",
      id: "google-docs",
      configured: isGoogleDocsConfigured(),
      envVars: [
        { name: "GOOGLE_DOCS_API_KEY", set: !!process.env.GOOGLE_DOCS_API_KEY, required: false },
        { name: "GOOGLE_DOCS_TOKEN", set: !!process.env.GOOGLE_DOCS_TOKEN, required: false },
      ],
      summary: isGoogleDocsConfigured()
        ? { ...getSyncSummary(), linkedDocs: getAllLinkedDocs().length }
        : { total: 0, synced: 0, errors: 0 },
      actions: ["link", "unlink", "pull", "sync-all"],
    },
    {
      name: "Notion",
      id: "notion",
      configured: isNotionConfigured(),
      envVars: [
        { name: "NOTION_TOKEN", set: !!process.env.NOTION_TOKEN, required: true },
        { name: "NOTION_DATABASE_ID", set: !!process.env.NOTION_DATABASE_ID, required: false },
      ],
      summary: isNotionConfigured()
        ? { ...getNotionSyncSummary(), linkedPages: getAllLinkedPages().length }
        : { total: 0, synced: 0, errors: 0 },
      actions: ["link", "unlink", "pull", "sync-all"],
    },
    {
      name: "Slack",
      id: "slack",
      configured: !!process.env.SLACK_WEBHOOK_URL,
      envVars: [
        { name: "SLACK_WEBHOOK_URL", set: !!process.env.SLACK_WEBHOOK_URL, required: true },
        { name: "SLACK_BOT_TOKEN", set: !!process.env.SLACK_BOT_TOKEN, required: false },
        { name: "SLACK_CHANNEL", set: !!process.env.SLACK_CHANNEL, required: false },
      ],
      summary: {
        webhookConfigured: !!process.env.SLACK_WEBHOOK_URL,
        botTokenConfigured: !!process.env.SLACK_BOT_TOKEN,
      },
      actions: ["post-test"],
    },
    {
      name: "Calendar",
      id: "calendar",
      configured: !!process.env.CALENDAR_URL,
      envVars: [
        { name: "CALENDAR_URL", set: !!process.env.CALENDAR_URL, required: true },
      ],
      summary: {
        feedConfigured: !!process.env.CALENDAR_URL,
      },
      actions: ["fetch-events"],
    },
    {
      name: "SSO / SAML",
      id: "sso",
      configured: process.env.SSO_ENABLED === "true",
      envVars: [
        { name: "SSO_ENABLED", set: process.env.SSO_ENABLED === "true", required: true },
        { name: "SSO_ENTITY_ID", set: !!process.env.SSO_ENTITY_ID, required: true },
        { name: "SSO_IDP_SSO_URL", set: !!process.env.SSO_IDP_SSO_URL, required: true },
      ],
      summary: {
        enabled: process.env.SSO_ENABLED === "true",
      },
      actions: [],
    },
  ];

  const configured = integrations.filter((i) => i.configured).length;

  return NextResponse.json({
    integrations,
    configured,
    total: integrations.length,
  });
}

/**
 * POST /api/integrations
 * { action: "test", integration: "slack" | "google-docs" | "notion" | "calendar" }
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (body.action !== "test") {
    return NextResponse.json({ error: "action must be test" }, { status: 400 });
  }

  const integration = body.integration as string;
  const results: { success: boolean; message: string; latencyMs: number } = { success: false, message: "", latencyMs: 0 };
  const start = Date.now();

  try {
    switch (integration) {
      case "slack": {
        const url = process.env.SLACK_WEBHOOK_URL;
        if (!url) { results.message = "SLACK_WEBHOOK_URL not set"; break; }
        // Test with a dry-run style HEAD/GET — don't actually post a message
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "" }), // Empty text won't post but validates the webhook
          signal: AbortSignal.timeout(5000),
        });
        // Slack returns 200 even for empty text, or specific error codes for bad URLs
        results.success = res.status < 500;
        results.message = results.success ? `Webhook reachable (HTTP ${res.status})` : `Webhook returned ${res.status}`;
        break;
      }
      case "google-docs": {
        const key = process.env.GOOGLE_DOCS_API_KEY;
        const token = process.env.GOOGLE_DOCS_TOKEN;
        if (!key && !token) { results.message = "No GOOGLE_DOCS_API_KEY or GOOGLE_DOCS_TOKEN set"; break; }
        // Test by hitting the API endpoint
        const url = `https://docs.googleapis.com/v1/documents/invalid-doc-id${key ? `?key=${key}` : ""}`;
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
        // 404 = API reachable but doc doesn't exist (expected), 403 = auth issues
        results.success = res.status === 404 || res.status === 200;
        results.message = results.success ? "Google Docs API reachable" : `API returned ${res.status} — check credentials`;
        break;
      }
      case "notion": {
        const token = process.env.NOTION_TOKEN;
        if (!token) { results.message = "NOTION_TOKEN not set"; break; }
        const res = await fetch("https://api.notion.com/v1/users/me", {
          headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28" },
          signal: AbortSignal.timeout(5000),
        });
        results.success = res.ok;
        results.message = results.success ? "Notion API connected" : `API returned ${res.status} — check token`;
        break;
      }
      case "calendar": {
        const url = process.env.CALENDAR_URL;
        if (!url) { results.message = "CALENDAR_URL not set"; break; }
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        results.success = res.ok;
        results.message = results.success ? "Calendar feed reachable" : `Feed returned ${res.status}`;
        break;
      }
      default:
        results.message = `Unknown integration: ${integration}`;
    }
  } catch (err) {
    results.message = `Connection failed: ${(err as Error).message}`;
  }

  results.latencyMs = Date.now() - start;
  return NextResponse.json(results);
}
