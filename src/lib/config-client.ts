"use server";

import { loadConfig, getDefaultTab } from "./config";
import type { HubConfig, TabConfig, PanelConfig, ToolConfig } from "./types";

export interface ClientConfig {
  name: string;
  tabs: TabConfig[];
  defaultTab: string;
  panels: Record<string, PanelConfig[]>;
  tools: ToolConfig[];
}

export async function getClientConfig(): Promise<ClientConfig> {
  const config = loadConfig();
  return {
    name: config.name,
    tabs: config.tabs,
    defaultTab: getDefaultTab(config),
    panels: config.panels || {},
    tools: config.tools || [],
  };
}
