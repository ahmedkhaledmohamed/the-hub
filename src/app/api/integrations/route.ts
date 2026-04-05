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
