// ── Config types (what the user defines in hub.config.ts) ─────────────

export interface HubConfig {
  name: string;
  port?: number;
  workspaces: WorkspaceConfig[];
  groups: GroupConfig[];
  tabs: TabConfig[];
  panels?: Record<string, PanelConfig[]>;
  tools?: ToolConfig[];
  scanner?: ScannerConfig;
}

export interface WorkspaceConfig {
  path: string;
  label: string;
}

export interface GroupConfig {
  id: string;
  label: string;
  description?: string;
  match: string | string[];
  tab: string;
  color?: string;
}

export interface TabConfig {
  id: string;
  label: string;
  icon?: string;
  default?: boolean;
}

export type PanelConfig =
  | TimelinePanelConfig
  | LinksPanelConfig
  | ToolsPanelConfig;

export interface TimelinePanelConfig {
  type: "timeline";
  title: string;
  badge?: BadgeConfig;
  items: TimelineItem[];
}

export interface LinksPanelConfig {
  type: "links";
  title: string;
  badge?: BadgeConfig;
  items: LinkItem[];
}

export interface ToolsPanelConfig {
  type: "tools";
  title: string;
  badge?: BadgeConfig;
  items: ToolConfig[];
}

export interface BadgeConfig {
  text: string;
  color?: "green" | "blue" | "orange" | "purple" | "red" | "cyan" | "yellow";
}

export interface TimelineItem {
  date: string;
  text: string;
  status?: "past" | "active" | "";
}

export interface LinkItem {
  label: string;
  url: string;
  icon?: string;
  meta?: string;
  external?: boolean;
  priority?: "must" | "should" | "could";
  description?: string;
}

export interface ToolConfig {
  label: string;
  url: string;
  icon?: string;
  description?: string;
}

export interface ScannerConfig {
  extensions?: string[];
  skipDirs?: string[];
  skipPaths?: string[];
  contentSnippetLength?: number;
}

// ── Manifest types (what the scanner produces) ────────────────────────

export interface Manifest {
  generatedAt: string;
  workspaces: string[];
  groups: ManifestGroup[];
  artifacts: Artifact[];
}

export interface ManifestGroup {
  id: string;
  label: string;
  description: string;
  color: string;
  tab: string;
  count: number;
}

export interface Artifact {
  path: string;
  title: string;
  type: "html" | "svg" | "md" | "csv";
  group: string;
  modifiedAt: string;
  size: number;
  staleDays: number;
  snippet?: string;
}
