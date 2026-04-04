import { NextRequest, NextResponse } from "next/server";
import {
  getAuditLog,
  getAuditCount,
  logAudit,
  getAllTags,
  getComplianceTags,
  addComplianceTag,
  removeComplianceTag,
  getTaggedArtifacts,
  getRetentionQueue,
  checkRetentionPolicy,
  isGovernanceEnabled,
} from "@/lib/governance";
import { getManifest } from "@/lib/manifest-store";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin                    — governance dashboard data
 * GET /api/admin?audit=true         — audit log
 * GET /api/admin?tags=<path>        — compliance tags for an artifact
 * GET /api/admin?tagged=<tag>       — artifacts with a specific tag
 * GET /api/admin?retention=true     — retention queue
 */
export async function GET(req: NextRequest) {
  const audit = req.nextUrl.searchParams.get("audit") === "true";
  const tagsPath = req.nextUrl.searchParams.get("tags");
  const tagged = req.nextUrl.searchParams.get("tagged");
  const retention = req.nextUrl.searchParams.get("retention") === "true";

  if (audit) {
    const action = req.nextUrl.searchParams.get("action") || undefined;
    return NextResponse.json({ auditLog: getAuditLog(50, action), total: getAuditCount() });
  }

  if (tagsPath) {
    return NextResponse.json({ path: tagsPath, tags: getComplianceTags(tagsPath) });
  }

  if (tagged) {
    return NextResponse.json({ tag: tagged, artifacts: getTaggedArtifacts(tagged) });
  }

  if (retention) {
    return NextResponse.json({ queue: getRetentionQueue() });
  }

  // Dashboard summary
  const manifest = getManifest();
  const retentionQueue = checkRetentionPolicy(manifest.artifacts);

  return NextResponse.json({
    governance: isGovernanceEnabled(),
    auditCount: getAuditCount(),
    tags: getAllTags(),
    retentionQueue: retentionQueue.length,
    artifactCount: manifest.artifacts.length,
  });
}

/**
 * POST /api/admin — governance actions
 * Body: { action: "tag", path, tag } — add compliance tag
 * Body: { action: "untag", path, tag } — remove compliance tag
 * Body: { action: "audit", userName, auditAction, resource } — log audit entry
 */
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    action: string;
    path?: string;
    tag?: string;
    userName?: string;
    auditAction?: string;
    resource?: string;
    details?: string;
  };

  switch (body.action) {
    case "tag":
      if (!body.path || !body.tag) return NextResponse.json({ error: "path and tag required" }, { status: 400 });
      addComplianceTag(body.path, body.tag, body.userName || "admin");
      logAudit(body.userName || "admin", "tag-added", body.path, `Tag: ${body.tag}`);
      return NextResponse.json({ tagged: true, path: body.path, tag: body.tag });

    case "untag":
      if (!body.path || !body.tag) return NextResponse.json({ error: "path and tag required" }, { status: 400 });
      removeComplianceTag(body.path, body.tag);
      logAudit(body.userName || "admin", "tag-removed", body.path, `Tag: ${body.tag}`);
      return NextResponse.json({ untagged: true, path: body.path, tag: body.tag });

    case "audit":
      logAudit(body.userName || "system", body.auditAction || "manual", body.resource, body.details);
      return NextResponse.json({ logged: true });

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
