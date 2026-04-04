/**
 * Internal event bus and webhook system.
 *
 * Events are emitted within The Hub and dispatched to configured
 * webhook URLs with HMAC signatures for verification.
 */

import { createHmac } from "crypto";
import { loadConfig } from "./config";
import type { HubEventType, WebhookConfig } from "./types";

// ── Types ──────────────────────────────────────────────────────────

export interface HubEvent {
  type: HubEventType;
  timestamp: string;
  data: Record<string, unknown>;
}

type EventHandler = (event: HubEvent) => void | Promise<void>;

// ── Event bus ──────────────────────────────────────────────────────

const listeners = new Map<HubEventType, EventHandler[]>();
const eventLog: HubEvent[] = [];
const MAX_LOG_SIZE = 100;

export function on(eventType: HubEventType, handler: EventHandler): void {
  const handlers = listeners.get(eventType) || [];
  handlers.push(handler);
  listeners.set(eventType, handlers);
}

export function off(eventType: HubEventType, handler: EventHandler): void {
  const handlers = listeners.get(eventType) || [];
  listeners.set(eventType, handlers.filter((h) => h !== handler));
}

export async function emit(type: HubEventType, data: Record<string, unknown> = {}): Promise<void> {
  const event: HubEvent = {
    type,
    timestamp: new Date().toISOString(),
    data,
  };

  // Store in log
  eventLog.unshift(event);
  if (eventLog.length > MAX_LOG_SIZE) eventLog.pop();

  // Notify internal listeners
  const handlers = listeners.get(type) || [];
  for (const handler of handlers) {
    try {
      await handler(event);
    } catch (err) {
      console.error(`[events] Handler error for ${type}:`, err);
    }
  }

  // Dispatch to webhooks
  await dispatchWebhooks(event);
}

export function getRecentEvents(limit = 20): HubEvent[] {
  return eventLog.slice(0, limit);
}

export function clearEventLog(): void {
  eventLog.length = 0;
}

// ── Webhook dispatch ───────────────────────────────────────────────

export function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

async function dispatchWebhooks(event: HubEvent): Promise<void> {
  let webhooks: WebhookConfig[];
  try {
    const config = loadConfig();
    webhooks = config.webhooks || [];
  } catch {
    return; // Config not available
  }

  for (const webhook of webhooks) {
    if (webhook.enabled === false) continue;
    if (!webhook.events.includes(event.type)) continue;

    try {
      await deliverWebhook(webhook, event);
    } catch (err) {
      console.error(`[webhooks] Delivery failed to ${webhook.url}:`, err);
    }
  }
}

export async function deliverWebhook(webhook: WebhookConfig, event: HubEvent): Promise<boolean> {
  const payload = JSON.stringify(event);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Hub-Event": event.type,
    "X-Hub-Timestamp": event.timestamp,
  };

  if (webhook.secret) {
    headers["X-Hub-Signature"] = `sha256=${signPayload(payload, webhook.secret)}`;
  }

  try {
    const res = await fetch(webhook.url, {
      method: "POST",
      headers,
      body: payload,
      signal: AbortSignal.timeout(10000),
    });

    return res.ok;
  } catch {
    return false;
  }
}

// ── Webhook configuration ──────────────────────────────────────────

export function getConfiguredWebhooks(): WebhookConfig[] {
  try {
    const config = loadConfig();
    return config.webhooks || [];
  } catch {
    return [];
  }
}

export function getWebhookCount(): number {
  return getConfiguredWebhooks().filter((w) => w.enabled !== false).length;
}

// ── Listener count (for testing) ───────────────────────────────────

export function getListenerCount(eventType: HubEventType): number {
  return (listeners.get(eventType) || []).length;
}

export function clearAllListeners(): void {
  listeners.clear();
}
