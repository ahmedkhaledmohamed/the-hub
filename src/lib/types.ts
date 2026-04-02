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
  framework?: FrameworkConfig;
  staleness?: { fresh?: number; aging?: number; stale?: number };
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
  | ToolsPanelConfig
  | UrlPanelConfig
  | MarkdownPanelConfig
  | EmbedPanelConfig
  | HealthPanelConfig;

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

export interface UrlPanelConfig {
  type: "url";
  title: string;
  badge?: BadgeConfig;
  url: string;
  template?: string;
  refreshInterval?: number;
}

export interface MarkdownPanelConfig {
  type: "markdown";
  title: string;
  badge?: BadgeConfig;
  file: string;
}

export interface EmbedPanelConfig {
  type: "embed";
  title: string;
  badge?: BadgeConfig;
  url: string;
  height?: number;
}

export interface HealthPanelConfig {
  type: "health";
  title: string;
  badge?: BadgeConfig;
}

// ── Change feed types ──────────────────────────────────────────────────

export interface ManifestSnapshot {
  generatedAt: string;
  artifacts: Record<string, string>;
}

export interface ChangeFeedEntry {
  path: string;
  title: string;
  type: "added" | "modified" | "deleted";
  group: string;
  modifiedAt?: string;
}

// ── Framework integration types ────────────────────────────────────────

export interface FrameworkConfig {
  path: string;
  tab?: string;
}

export interface FrameworkSkill {
  id: string;
  name: string;
  description: string;
  argumentHint?: string;
  allowedTools?: string;
  installed: { cursor: boolean; claude: boolean; codex: boolean };
}

export interface McpServerEntry {
  id: string;
  name: string;
  description: string;
  tier: string;
  tierLabel: string;
  transport: "stdio" | "url";
  pmUseCase: string;
  needsCredentials: boolean;
  configured: boolean;
}

export interface FrameworkCommand {
  id: string;
  name: string;
  firstLine: string;
}

export interface FrameworkHealth {
  version: string;
  skillsInstalled: number;
  skillsTotal: number;
  mcpsConfigured: number;
  mcpsTotal: number;
  lastCommitDate: string;
  repoPath: string;
}

export interface McpTier {
  label: string;
  description: string;
}

export interface FrameworkCatalog {
  skills: FrameworkSkill[];
  mcpServers: McpServerEntry[];
  commands: FrameworkCommand[];
  health: FrameworkHealth;
  tiers: Record<string, McpTier>;
}

// ── Manifest types (what the scanner produces) ────────────────────────

export interface Manifest {
  generatedAt: string;
  lastScanReason?: string;
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
