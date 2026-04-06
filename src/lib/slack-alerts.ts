/**
 * Slack proactive alerts — push insights to Slack when issues are detected.
 *
 * Triggered after scan when noteworthy conditions are found:
 * 1. Contradictions between decisions
 * 2. Knowledge decay (docs losing relevance)
 * 3. Meeting prep context (calendar-driven, if configured)
 *
 * Only sends alerts when SLACK_WEBHOOK_URL is configured.
 * Rate-limited: max 1 alert per type per hour.
 */

import { isSlackConfigured, postToSlack, type SlackMessage, type SlackBlock } from "./slack";

// ── Rate limiting ─────────────────────────────────────────────────

const lastAlertTime: Record<string, number> = {};
const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

function canSendAlert(type: string): boolean {
  const last = lastAlertTime[type] || 0;
  return Date.now() - last > ALERT_COOLDOWN_MS;
}

function markAlertSent(type: string): void {
  lastAlertTime[type] = Date.now();
}

/**
 * Reset alert cooldowns (for testing).
 */
export function resetAlertCooldowns(): void {
  for (const key of Object.keys(lastAlertTime)) {
    delete lastAlertTime[key];
  }
}

// ── Alert formatters ──────────────────────────────────────────────

export interface Contradiction {
  decisionA: { summary: string; artifactPath: string };
  decisionB: { summary: string; artifactPath: string };
  reason: string;
}

export function formatContradictionAlert(contradictions: Contradiction[]): SlackMessage {
  const items = contradictions.slice(0, 5).map((c) =>
    `• "${c.decisionA.summary}" vs "${c.decisionB.summary}"\n  _${c.reason}_`
  ).join("\n\n");

  return {
    text: `Hub: ${contradictions.length} decision contradiction(s) detected`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: "⚠️ Decision Contradictions Detected" } },
      { type: "section", text: { type: "mrkdwn", text: items } },
      { type: "context", elements: [{ type: "mrkdwn", text: `_${contradictions.length} total — review in The Hub_` }] },
    ],
  };
}

export interface DecayAlert {
  path: string;
  title: string;
  decayLevel: string;
  recentViews: number;
  historicalViews: number;
}

export function formatDecayAlert(decaying: DecayAlert[]): SlackMessage {
  const items = decaying.slice(0, 5).map((d) =>
    `• *${d.title}* (\`${d.path}\`) — ${d.decayLevel} (${d.recentViews} recent vs ${d.historicalViews} historical views)`
  ).join("\n");

  return {
    text: `Hub: ${decaying.length} document(s) losing relevance`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: "📉 Knowledge Decay Alert" } },
      { type: "section", text: { type: "mrkdwn", text: items } },
      { type: "context", elements: [{ type: "mrkdwn", text: `_${decaying.length} docs declining — consider updating or archiving_` }] },
    ],
  };
}

export interface MeetingContext {
  title: string;
  startTime: string;
  relatedDocs: Array<{ title: string; path: string }>;
  recentDecisions: Array<{ summary: string }>;
}

export function formatMeetingPrepAlert(meeting: MeetingContext): SlackMessage {
  const docList = meeting.relatedDocs.slice(0, 5).map((d) => `• ${d.title} (\`${d.path}\`)`).join("\n");
  const decisionList = meeting.recentDecisions.slice(0, 3).map((d) => `• ${d.summary}`).join("\n");

  const sections: SlackBlock[] = [
    { type: "header", text: { type: "plain_text", text: `📅 Meeting Prep: ${meeting.title}` } },
  ];

  if (meeting.relatedDocs.length > 0) {
    sections.push({ type: "section", text: { type: "mrkdwn", text: `*Related Docs:*\n${docList}` } });
  }
  if (meeting.recentDecisions.length > 0) {
    sections.push({ type: "section", text: { type: "mrkdwn", text: `*Recent Decisions:*\n${decisionList}` } });
  }
  sections.push({ type: "context", elements: [{ type: "mrkdwn", text: `_Meeting at ${meeting.startTime}_` }] });

  return {
    text: `Hub: Meeting prep for "${meeting.title}"`,
    blocks: sections,
  };
}

// ── Alert dispatchers ─────────────────────────────────────────────

/**
 * Check for contradictions and send alert if found.
 */
export async function sendContradictionAlert(): Promise<boolean> {
  if (!isSlackConfigured() || !canSendAlert("contradiction")) return false;

  try {
    const { findContradictions } = require("./decision-tracker");
    const contradictions = findContradictions();
    if (contradictions.length === 0) return false;

    const message = formatContradictionAlert(contradictions);
    const sent = await postToSlack(message);
    if (sent) markAlertSent("contradiction");
    return sent;
  } catch {
    return false;
  }
}

/**
 * Check for knowledge decay and send alert if critical docs are declining.
 */
export async function sendDecayAlert(): Promise<boolean> {
  if (!isSlackConfigured() || !canSendAlert("decay")) return false;

  try {
    const { detectDecay, getDecayingDocs } = require("./knowledge-decay");
    const reports = detectDecay();
    const decaying = getDecayingDocs(reports);
    if (decaying.length === 0) return false;

    const alerts: DecayAlert[] = decaying.slice(0, 10).map((d: { path: string; decayLevel: string; recentViews: number; historicalViews: number }) => ({
      path: d.path,
      title: d.path.split("/").pop()?.replace(/\.\w+$/, "") || d.path,
      decayLevel: d.decayLevel,
      recentViews: d.recentViews,
      historicalViews: d.historicalViews,
    }));

    const message = formatDecayAlert(alerts);
    const sent = await postToSlack(message);
    if (sent) markAlertSent("decay");
    return sent;
  } catch {
    return false;
  }
}

/**
 * Run all proactive alerts after a scan.
 * Non-blocking — failures don't affect the scan pipeline.
 */
export async function runProactiveAlerts(): Promise<{ contradiction: boolean; decay: boolean }> {
  if (!isSlackConfigured()) return { contradiction: false, decay: false };

  const [contradiction, decay] = await Promise.all([
    sendContradictionAlert().catch(() => false),
    sendDecayAlert().catch(() => false),
  ]);

  return { contradiction, decay };
}
