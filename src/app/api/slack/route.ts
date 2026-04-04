import { NextRequest, NextResponse } from "next/server";
import {
  isSlackConfigured,
  postToSlack,
  handleSlashCommand,
  formatChangeSummary,
  formatAgentOutput,
} from "@/lib/slack";
import type { SlackCommandPayload } from "@/lib/slack";

export const dynamic = "force-dynamic";

/**
 * GET /api/slack — Slack integration status
 */
export async function GET() {
  return NextResponse.json({
    configured: isSlackConfigured(),
    hasWebhook: !!process.env.SLACK_WEBHOOK_URL,
    hasBotToken: !!process.env.SLACK_BOT_TOKEN,
  });
}

/**
 * POST /api/slack — handle slash commands or send messages
 * Slash command: application/x-www-form-urlencoded (from Slack)
 * Message: application/json { action: "post", text, channel? }
 */
export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";

  // Slack slash command (form-urlencoded)
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await req.formData();
    const payload: SlackCommandPayload = {
      command: formData.get("command") as string || "",
      text: formData.get("text") as string || "",
      response_url: formData.get("response_url") as string || "",
      user_id: formData.get("user_id") as string || "",
      user_name: formData.get("user_name") as string || "",
      channel_id: formData.get("channel_id") as string || "",
      channel_name: formData.get("channel_name") as string || "",
    };

    const response = await handleSlashCommand(payload);
    return NextResponse.json({ response_type: "in_channel", text: response });
  }

  // JSON: send a message
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action, text, channel } = body as { action?: string; text?: string; channel?: string };

  if (action === "post" && text) {
    const ok = await postToSlack({ text, channel });
    return NextResponse.json({ sent: ok });
  }

  if (action === "test") {
    const ok = await postToSlack({ text: "🏠 Hub test message — Slack integration is working!" });
    return NextResponse.json({ sent: ok });
  }

  return NextResponse.json({ error: "action must be 'post' or 'test'" }, { status: 400 });
}
