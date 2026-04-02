"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { TabConfig, PanelConfig, ToolConfig } from "@/lib/types";

export interface HubContext {
  name: string;
  tabs: TabConfig[];
  defaultTab: string;
  panels: Record<string, PanelConfig[]>;
  tools: ToolConfig[];
}

const Context = createContext<HubContext | null>(null);

export function HubProvider({
  value,
  children,
}: {
  value: HubContext;
  children: ReactNode;
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useHubConfig(): HubContext {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useHubConfig must be used inside HubProvider");
  return ctx;
}
