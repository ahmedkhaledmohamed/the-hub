"use client";

import { useState, useCallback } from "react";
import type { FrameworkCatalog as FrameworkCatalogType } from "@/lib/types";
import { HealthSummary } from "./health-summary";
import { SkillCatalog } from "./skill-catalog";
import { McpCatalog } from "./mcp-catalog";
import { CommandsPanel } from "./commands-panel";

interface FrameworkCatalogProps {
  catalog: FrameworkCatalogType;
}

export function FrameworkCatalog({ catalog: initial }: FrameworkCatalogProps) {
  const [catalog, setCatalog] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await fetch("/api/framework");
      if (r.ok) {
        const data = await r.json();
        if (data) setCatalog(data);
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  return (
    <section className="mb-6">
      <HealthSummary
        health={catalog.health}
        onRefresh={refresh}
        refreshing={refreshing}
      />
      <SkillCatalog skills={catalog.skills} />
      <McpCatalog servers={catalog.mcpServers} tiers={catalog.tiers} />
      <CommandsPanel commands={catalog.commands} />
    </section>
  );
}
