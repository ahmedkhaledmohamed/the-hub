/**
 * Slack bidirectional integration.
 *
 * Outbound: Post change summaries, hygiene alerts, and agent outputs to Slack channels.
 * Inbound: Receive slash commands (/hub search, /hub status) via webhook.
 *
 * Configuration:
 *   SLACK_WEBHOOK_URL — Incoming webhook URL for posting messages
 *   SLACK_BOT_TOKEN — Bot token for richer API access (optional)
 *   SLACK_CHANNEL — Default channel ID (optional, webhook has one built-in)
 */

// ── Types ──────────────────────────────────────────────────────────

export interface SlackMessage {
  text: string;
  blocks?: SlackBlock[];
  channel?: string;
  thread_ts?: string;
}

export interface SlackBlock {
  type: string;
  text?: { type: string; text: string };
  elements?: Array<{ type: string; text?: string; url?: string }>;
  fields?: Array<{ type: string; text: string }>;
}

export interface SlackCommandPayload {
  command: string;
  text: string;
  response_url: string;
  user_id: string;
  user_name: string;
  channel_id: string;
  channel_name: string;
}

// ── Configuration ──────────────────────────────────────────────────

export function getSlackWebhookUrl(): string | null {
  return process.env.SLACK_WEBHOOK_URL || null;
}

export function getSlackBotToken(): string | null {
  return process.env.SLACK_BOT_TOKEN || null;
}

export function isSlackConfigured(): boolean {
  return !!getSlackWebhookUrl() || !!getSlackBotToken();
}

// ── Send messages ──────────────────────────────────────────────────

export async function postToSlack(message: SlackMessage): Promise<boolean> {
  const webhookUrl = getSlackWebhookUrl();
  const botToken = getSlackBotToken();

  if (botToken && message.channel) {
    // Use Bot API for channel-specific messages
    try {
      const res = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${botToken}`,
        },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(10000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  if (webhookUrl) {
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message.text, blocks: message.blocks }),
        signal: AbortSignal.timeout(10000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  return false;
}

// ── Message formatters ─────────────────────────────────────────────

export function formatChangeSummary(changes: Array<{ title: string; type: string; path: string }>): SlackMessage {
  const added = changes.filter((c) => c.type === "added");
  const modified = changes.filter((c) => c.type === "modified");
  const deleted = changes.filter((c) => c.type === "deleted");

  const lines: string[] = [];
  if (added.length) lines.push(`*+${added.length} added:* ${added.map((c) => c.title).join(", ")}`);
  if (modified.length) lines.push(`*~${modified.length} modified:* ${modified.map((c) => c.title).join(", ")}`);
  if (deleted.length) lines.push(`*-${deleted.length} deleted:* ${deleted.map((c) => c.title).join(", ")}`);

  return {
    text: `Hub workspace updated: ${changes.length} change(s)`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: "📋 Hub Workspace Update" } },
      { type: "section", text: { type: "mrkdwn", text: lines.join("\n") || "No changes." } },
    ],
  };
}

export function formatHygieneAlert(findings: Array<{ type: string; severity: string; suggestion: string }>): SlackMessage {
  const highCount = findings.filter((f) => f.severity === "high").length;
  const text = findings.slice(0, 5).map(
    (f) => `• *${f.type}* [${f.severity}]: ${f.suggestion.slice(0, 100)}`
  ).join("\n");

  return {
    text: `Hub hygiene: ${findings.length} finding(s), ${highCount} high severity`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: "🔍 Document Hygiene Alert" } },
      { type: "section", text: { type: "mrkdwn", text: text || "No findings." } },
    ],
  };
}

export function formatAgentOutput(agentId: string, content: string): SlackMessage {
  return {
    text: `Hub agent "${agentId}" completed`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: `🤖 Agent: ${agentId}` } },
      { type: "section", text: { type: "mrkdwn", text: content.slice(0, 2000) } },
    ],
  };
}

// ── Slash command handler ──────────────────────────────────────────

export async function handleSlashCommand(payload: SlackCommandPayload): Promise<string> {
  const args = payload.text.trim().split(/\s+/);
  const subcommand = args[0]?.toLowerCase() || "help";

  switch (subcommand) {
    case "search": {
      const query = args.slice(1).join(" ");
      if (!query) return "Usage: /hub search <query>";
      // This would call the Hub API — for now return a formatted response
      return `🔍 Searching for "${query}"... (connect Hub API for live results)`;
    }
    case "status":
      return "📊 Hub status: connect the Hub API at HUB_URL for live stats.";
    case "help":
    default:
      return "*Hub Commands:*\n• `/hub search <query>` — Search your workspace\n• `/hub status` — Workspace stats\n• `/hub help` — Show this message";
  }
}
