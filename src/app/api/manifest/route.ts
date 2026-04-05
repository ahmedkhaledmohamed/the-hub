import { NextRequest, NextResponse } from "next/server";
import { getManifest } from "@/lib/manifest-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const manifest = getManifest();

    // Pagination params
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "0", 10), 500);
    const offset = Math.max(parseInt(req.nextUrl.searchParams.get("offset") || "0", 10), 0);
    const group = req.nextUrl.searchParams.get("group");
    const tab = req.nextUrl.searchParams.get("tab");

    // Filter artifacts
    let artifacts = manifest.artifacts;
    if (group) artifacts = artifacts.filter((a) => a.group === group);
    if (tab) {
      const tabGroups = new Set(manifest.groups.filter((g) => g.tab === tab).map((g) => g.id));
      artifacts = artifacts.filter((a) => tabGroups.has(a.group));
    }

    const total = artifacts.length;

    // Paginate if limit > 0
    if (limit > 0) {
      const paged = artifacts.slice(offset, offset + limit);
      return NextResponse.json({
        ...manifest,
        artifacts: paged,
        pagination: {
          total,
          count: paged.length,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      });
    }

    // NDJSON streaming for large workspaces
    const format = req.nextUrl.searchParams.get("format");
    if (format === "ndjson") {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          // First line: metadata (groups, generatedAt, etc.)
          controller.enqueue(encoder.encode(
            JSON.stringify({
              _type: "meta",
              generatedAt: manifest.generatedAt,
              lastScanReason: (manifest as unknown as Record<string, unknown>).lastScanReason,
              groupCount: manifest.groups.length,
              artifactCount: artifacts.length,
              groups: manifest.groups.map((g) => ({ id: g.id, label: g.label, count: g.count, tab: g.tab })),
            }) + "\n",
          ));

          // Subsequent lines: one artifact per line
          for (const artifact of artifacts) {
            controller.enqueue(encoder.encode(
              JSON.stringify({ _type: "artifact", ...artifact }) + "\n",
            ));
          }

          // Final line: done marker
          controller.enqueue(encoder.encode(
            JSON.stringify({ _type: "done", total: artifacts.length }) + "\n",
          ));

          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson",
          "Transfer-Encoding": "chunked",
        },
      });
    }

    // No pagination — return all (backward compatible)
    return NextResponse.json(manifest);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to generate manifest", detail: String(error) },
      { status: 500 },
    );
  }
}
