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
  hygieneRules?: HygieneRule[];
  planningSources?: PlanningSourceConfig[];
  mentions?: { self?: string[]; team?: string[]; org?: string[] };
  templates?: DocTemplate[];
  agents?: AgentConfig[];
  webhooks?: WebhookConfig[];
  contexts?: ContextConfig[];
  sharing?: SharingConfig;
  federation?: FederationConfig;
  governance?: GovernanceConfig;
}

export interface PlanningSourceConfig {
  id: string;
  type: "google-docs" | "confluence" | "jira" | "notion" | "github" | "agent";
  label: string;
  enabled?: boolean;
  group?: string;
  tab?: string;
  // Auth (per-source override; falls back to env vars)
  apiToken?: string;
  authScheme?: "bearer" | "basic" | "cookie";
  // Google Docs
  folderId?: string;
  // Confluence
  spaceKey?: string;
  baseUrl?: string;
  // Jira
  projectKey?: string;
  jql?: string;
  // Notion
  databaseId?: string;
  // GitHub
  repoUrl?: string;
  repoPath?: string;
}

export interface HygieneRule {
  /** Unique rule ID (e.g., "max-stale-decisions") */
  id: string;
  /** Human-readable rule name */
  name: string;
  /** Rule type determines evaluation logic */
  type: "max-staleness" | "no-duplicates" | "required-field" | "max-similarity" | "custom";
  /** Severity when rule is violated */
  severity: "high" | "medium" | "low";
  /** Glob pattern to match artifacts (e.g., "decisions/**") */
  match?: string;
  /** Group ID to scope rule to (alternative to match) */
  group?: string;
  /** Configuration specific to rule type */
  config: {
    /** max-staleness: max days before flagging */
    maxDays?: number;
    /** max-similarity: max similarity % (0-100) before flagging */
    maxSimilarity?: number;
    /** required-field: field name to check in content (e.g., "last-reviewed") */
    field?: string;
    /** custom: custom check function description */
    description?: string;
  };
}

export interface GovernanceConfig {
  /** Auto-archive docs older than N days */
  retentionPolicy?: { maxDays: number; action: "archive" | "flag" };
  /** Compliance tags that can be applied to artifacts */
  complianceTags?: string[];
  /** Enable audit logging */
  auditLog?: boolean;
}

export type ComplianceTag = "pii" | "confidential" | "internal" | "public" | string;

export interface FederationConfig {
  /** Peer Hub instances to federate with */
  peers: PeerConfig[];
}

export interface PeerConfig {
  /** Display name for this peer */
  name: string;
  /** Base URL of the peer Hub (e.g. http://192.168.1.5:9002) */
  url: string;
  /** API key for authentication with the peer */
  apiKey?: string;
  /** Whether this peer is active */
  enabled?: boolean;
}

export interface SharingConfig {
  /** Enable shared access */
  enabled: boolean;
  /** Default access mode for shared users */
  mode: "read-only" | "read-write";
  /** API keys mapped to user roles: { key: { name, role } } */
  users?: Record<string, { name: string; role: "read-only" | "read-write" | "admin" }>;
}

export type UserRole = "admin" | "read-write" | "read-only" | "anonymous";

export interface ContextConfig {
  /** Context display name */
  name: string;
  /** Path to the hub.config.ts for this context (relative or absolute) */
  config: string;
  /** Optional icon identifier */
  icon?: string;
}

export interface WebhookConfig {
  /** Webhook URL to POST to */
  url: string;
  /** Events to subscribe to */
  events: HubEventType[];
  /** HMAC secret for signature verification */
  secret?: string;
  /** Whether this webhook is active */
  enabled?: boolean;
}

export type HubEventType =
  | "scan.complete"
  | "artifact.created"
  | "artifact.modified"
  | "artifact.deleted"
  | "hygiene.finding"
  | "agent.output";

export interface AgentConfig {
  /** Unique agent identifier */
  id: string;
  /** Agent type */
  type: "stale-doc-reminder" | "weekly-summary" | "duplicate-resolver" | "custom";
  /** Whether this agent is active */
  enabled?: boolean;
  /** Cron-like schedule: "daily", "weekly", "hourly", or cron expression */
  schedule?: string;
  /** Agent-specific options */
  options?: Record<string, unknown>;
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
  | HealthPanelConfig
  | ChartPanelConfig
  | ChecklistPanelConfig
  | CustomPanelConfig;

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

export interface DocTemplate {
  id: string;
  label: string;
  content: string;
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

export interface ChartPanelConfig {
  type: "chart";
  title: string;
  badge?: BadgeConfig;
  series: ChartSeries[];
  height?: number;
}

export interface ChartSeries {
  label: string;
  data: number[];
  color?: string;
}

export interface ChecklistPanelConfig {
  type: "checklist";
  title: string;
  badge?: BadgeConfig;
  items: ChecklistItem[];
  persistKey?: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  description?: string;
}

export interface CustomPanelConfig {
  type: "custom";
  title: string;
  badge?: BadgeConfig;
  url?: string;
  markdown?: string;
  height?: number;
}

// ── Change feed types ──────────────────────────────────────────────────

export interface ManifestSnapshot {
  generatedAt: string;
  artifacts: Record<string, string>; // path -> modifiedAt
  hashes?: Record<string, string>;   // path -> content hash
}

export interface DiffLine {
  type: "added" | "removed" | "context";
  content: string;
}

export type TriageLevel = "routine" | "attention" | "breaking" | "unknown";

export interface ChangeFeedEntry {
  path: string;
  title: string;
  type: "added" | "modified" | "deleted";
  group: string;
  modifiedAt?: string;
  diff?: DiffLine[];
  triage?: TriageLevel;
  triageReason?: string;
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

// ── Hygiene analysis types ────────────────────────────────────────────

export type HygieneFindingType =
  | "exact-duplicate"
  | "near-duplicate"
  | "template-overlap"
  | "similar-title"
  | "same-filename"
  | "superseded"
  | "stale-orphan";

export interface HygieneFinding {
  id: string;
  type: HygieneFindingType;
  severity: "high" | "medium" | "low";
  artifacts: Artifact[];
  similarity?: number;
  suggestion: string;
}

export interface HygieneReport {
  findings: HygieneFinding[];
  stats: {
    totalFindings: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    filesAnalyzed: number;
    analyzedAt: string;
  };
}

// ── Repo discovery types ───────────────────────────────────────────────

export interface RepoInfo {
  name: string;
  path: string;
  workspace: string;
  branch: string;
  remoteUrl: string;
  browseUrl: string;
  lastActivity: string;
  hasClaudeFile: boolean;
  hasCursorRules: boolean;
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
  type: "html" | "svg" | "md" | "csv" | "txt" | "json" | "yaml" | "code" | "pdf";
  group: string;
  modifiedAt: string;
  size: number;
  staleDays: number;
  snippet?: string;
}

// ── Plugin types ───────────────────────────────────────────────────

export interface HubPlugin {
  /** Unique plugin identifier */
  name: string;
  /** Semantic version */
  version: string;
  /** Human-readable description */
  description?: string;

  /** Called after workspace scan completes. Can contribute virtual artifacts. */
  onScan?: (manifest: Manifest) => Promise<Artifact[]> | Artifact[];

  /** Called when search is performed. Can extend results. */
  onSearch?: (query: string, results: Artifact[]) => Promise<Artifact[]> | Artifact[];

  /** Returns additional panel configs to render. */
  onRender?: () => PanelConfig[] | Promise<PanelConfig[]>;

  /** Called when the plugin is loaded. Return cleanup function. */
  onInit?: () => void | (() => void) | Promise<void | (() => void)>;

  /** Called when the plugin is unloaded. */
  onDestroy?: () => void | Promise<void>;
}
