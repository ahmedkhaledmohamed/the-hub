/**
 * AI content generation for The Hub.
 *
 * Template-driven generation with workspace context injection.
 * Supports: status updates, handoff docs, PRD outlines.
 */

import { getManifest } from "./manifest-store";
import { getArtifactContent } from "./db";
import { computeChangeFeed, loadPreviousSnapshot } from "./change-feed";
import { complete, isAiConfigured } from "./ai-client";
import type { AiMessage } from "./ai-client";

// ── Types ──────────────────────────────────────────────────────────

export type GenerateTemplate = "status-update" | "handoff-doc" | "prd-outline" | "custom";

export interface GenerateOptions {
  template: GenerateTemplate;
  /** Group ID — used by handoff-doc */
  groupId?: string;
  /** Artifact paths — used by prd-outline */
  artifactPaths?: string[];
  /** Custom prompt — used by custom template */
  customPrompt?: string;
}

export interface GenerateResult {
  content: string;
  template: GenerateTemplate;
  model: string;
  sourcePaths: string[];
}

// ── Template prompts ───────────────────────────────────────────────

function buildStatusUpdatePrompt(): { system: string; user: string; sourcePaths: string[] } {
  const manifest = getManifest();
  const previous = loadPreviousSnapshot();
  const changes = computeChangeFeed(manifest, previous);

  const sourcePaths: string[] = [];

  const changedSummary = changes.slice(0, 15).map((c) => {
    sourcePaths.push(c.path);
    return `- [${c.type.toUpperCase()}] ${c.title} (${c.path})`;
  }).join("\n");

  const groupSummary = manifest.groups
    .map((g) => `- ${g.label}: ${g.count} artifacts`)
    .join("\n");

  return {
    system: "You are a professional technical writer creating a weekly status update. Be concise, specific, and action-oriented. Use markdown formatting. Structure as: Summary, Key Changes, Next Steps.",
    user: `Generate a status update based on the following workspace activity.

**Workspace:** ${manifest.artifacts.length} total artifacts across ${manifest.groups.length} groups.

**Groups:**
${groupSummary}

**Recent changes (since last baseline):**
${changedSummary || "No changes detected since last baseline."}

Write a professional status update (3-5 paragraphs) that:
1. Opens with a 1-sentence summary of the week
2. Highlights the most significant changes
3. Notes any areas that may need attention (stale groups, lots of churn)
4. Closes with recommended next steps`,
    sourcePaths,
  };
}

function buildHandoffDocPrompt(groupId: string): { system: string; user: string; sourcePaths: string[] } {
  const manifest = getManifest();
  const groupArtifacts = manifest.artifacts.filter((a) => a.group === groupId);
  const group = manifest.groups.find((g) => g.id === groupId);

  if (groupArtifacts.length === 0) {
    throw new Error(`No artifacts found in group "${groupId}"`);
  }

  const sourcePaths: string[] = [];
  const artifactSummaries = groupArtifacts.slice(0, 10).map((a) => {
    sourcePaths.push(a.path);
    const content = getArtifactContent(a.path);
    const preview = content?.slice(0, 1500) || "(no content)";
    return `### ${a.title} (${a.path})\nStale: ${a.staleDays} days\n\n${preview}`;
  }).join("\n\n---\n\n");

  return {
    system: "You are writing a handoff document for someone taking over a project. Be thorough but concise. Cover: what exists, what's in progress, key decisions made, and open questions.",
    user: `Generate a handoff document for the "${group?.label || groupId}" group.

**Group:** ${group?.label || groupId} — ${group?.description || "No description"}
**Artifacts:** ${groupArtifacts.length} documents

**Documents in this group:**

${artifactSummaries}

Write a handoff document (4-6 paragraphs) that:
1. Opens with what this group/project is about
2. Summarizes the key documents and their purposes
3. Identifies the current state (what's fresh vs stale)
4. Lists key decisions or patterns visible in the docs
5. Notes open questions or areas that need attention`,
    sourcePaths,
  };
}

function buildPrdOutlinePrompt(artifactPaths: string[]): { system: string; user: string; sourcePaths: string[] } {
  if (artifactPaths.length === 0) {
    throw new Error("No artifact paths provided");
  }

  const sourcePaths: string[] = [];
  const researchContent = artifactPaths.slice(0, 5).map((p) => {
    sourcePaths.push(p);
    const content = getArtifactContent(p);
    return content ? `### ${p}\n\n${content.slice(0, 2000)}` : null;
  }).filter(Boolean).join("\n\n---\n\n");

  return {
    system: "You are a senior product manager writing a PRD outline. Be structured, specific, and grounded in the research provided. Use standard PRD sections.",
    user: `Generate a PRD outline based on the following research documents.

**Research documents:**

${researchContent}

Write a PRD outline with these sections:
1. **Problem Statement** — what problem are we solving and for whom
2. **Goals & Success Metrics** — measurable outcomes
3. **Proposed Solution** — high-level approach
4. **User Stories** — 3-5 key user stories
5. **Scope** — what's in vs out of scope
6. **Open Questions** — things to resolve before building
7. **Risks** — key risks and mitigations

Keep each section concise (2-4 sentences). This is an outline, not a full PRD.`,
    sourcePaths,
  };
}

// ── Main generation function ───────────────────────────────────────

export async function generate(options: GenerateOptions): Promise<GenerateResult> {
  if (!isAiConfigured()) {
    return {
      content: "**AI not configured.** Set `AI_GATEWAY_URL` and `AI_GATEWAY_KEY` in `.env.local` to enable content generation.",
      template: options.template,
      model: "none",
      sourcePaths: [],
    };
  }

  let system: string;
  let user: string;
  let sourcePaths: string[];

  switch (options.template) {
    case "status-update": {
      const prompt = buildStatusUpdatePrompt();
      system = prompt.system;
      user = prompt.user;
      sourcePaths = prompt.sourcePaths;
      break;
    }
    case "handoff-doc": {
      if (!options.groupId) throw new Error("groupId required for handoff-doc");
      const prompt = buildHandoffDocPrompt(options.groupId);
      system = prompt.system;
      user = prompt.user;
      sourcePaths = prompt.sourcePaths;
      break;
    }
    case "prd-outline": {
      if (!options.artifactPaths?.length) throw new Error("artifactPaths required for prd-outline");
      const prompt = buildPrdOutlinePrompt(options.artifactPaths);
      system = prompt.system;
      user = prompt.user;
      sourcePaths = prompt.sourcePaths;
      break;
    }
    case "custom": {
      if (!options.customPrompt) throw new Error("customPrompt required for custom template");
      system = "You are a helpful writing assistant for a knowledge worker. Use markdown formatting.";
      user = options.customPrompt;
      sourcePaths = [];
      break;
    }
    default:
      throw new Error(`Unknown template: ${options.template}`);
  }

  const messages: AiMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  const result = await complete({
    messages,
    maxTokens: 2048,
    temperature: 0.3,
  });

  return {
    content: result.content,
    template: options.template,
    model: result.model,
    sourcePaths,
  };
}

/**
 * List available generation templates.
 */
export function getTemplates(): Array<{ id: GenerateTemplate; label: string; description: string; requiresGroup: boolean; requiresPaths: boolean }> {
  return [
    { id: "status-update", label: "Status Update", description: "Weekly status from change feed data", requiresGroup: false, requiresPaths: false },
    { id: "handoff-doc", label: "Handoff Document", description: "Project handoff for a group", requiresGroup: true, requiresPaths: false },
    { id: "prd-outline", label: "PRD Outline", description: "Product requirements from research docs", requiresGroup: false, requiresPaths: true },
    { id: "custom", label: "Custom", description: "Free-form generation with your own prompt", requiresGroup: false, requiresPaths: false },
  ];
}
