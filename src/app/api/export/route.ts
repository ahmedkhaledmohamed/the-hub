import { NextRequest, NextResponse } from "next/server";
import { getManifest } from "@/lib/manifest-store";
import { getClientConfig } from "@/lib/config-client";

export const dynamic = "force-dynamic";

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function GET(req: NextRequest) {
  const tab = req.nextUrl.searchParams.get("tab") || "all";
  const config = await getClientConfig();
  const manifest = getManifest();

  const tabConfig = config.tabs.find((t) => t.id === tab);
  const tabLabel = tabConfig?.label || tab;

  const tabGroups =
    tab === "all"
      ? manifest.groups
      : manifest.groups.filter((g) => g.tab === tab);
  const groupIds = new Set(tabGroups.map((g) => g.id));
  const tabArtifacts = manifest.artifacts.filter((a) => groupIds.has(a.group));

  const panels = config.panels[tab] || [];

  const groupSections = tabGroups.map((group) => {
    const arts = tabArtifacts
      .filter((a) => a.group === group.id)
      .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

    const rows = arts.map((a) =>
      `<tr>
        <td><span class="type">${escapeHtml(a.type)}</span></td>
        <td>${escapeHtml(a.title)}</td>
        <td class="dim">${a.staleDays}d ago</td>
        <td class="dim">${escapeHtml(a.modifiedAt.split("T")[0])}</td>
      </tr>`
    ).join("\n");

    return `
      <section>
        <h2 style="color: ${group.color || '#fff'}">${escapeHtml(group.label)} <small>(${arts.length})</small></h2>
        ${group.description ? `<p class="dim">${escapeHtml(group.description)}</p>` : ""}
        <table>${rows}</table>
      </section>`;
  }).join("\n");

  const panelSections = panels.map((p) => {
    if (p.type === "links") {
      const items = p.items.map((item) =>
        `<li><a href="${escapeHtml(item.url)}">${escapeHtml(item.label)}</a>${item.meta ? ` <small class="dim">${escapeHtml(item.meta)}</small>` : ""}</li>`
      ).join("");
      return `<section><h3>${escapeHtml(p.title)}</h3><ul>${items}</ul></section>`;
    }
    if (p.type === "timeline") {
      const items = p.items.map((item) =>
        `<li><strong>${escapeHtml(item.date)}</strong> ${item.text}</li>`
      ).join("");
      return `<section><h3>${escapeHtml(p.title)}</h3><ul class="timeline">${items}</ul></section>`;
    }
    return "";
  }).join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(config.name)} — ${escapeHtml(tabLabel)}</title>
<style>
  :root { --bg: #121212; --surface: #1a1a1a; --border: #2a2a2a; --text: #e0e0e0; --dim: #888; --accent: #1db954; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); padding: 2rem; max-width: 1000px; margin: 0 auto; line-height: 1.5; }
  h1 { font-size: 1.3rem; margin-bottom: 0.5rem; }
  h2 { font-size: 1rem; margin: 1.5rem 0 0.5rem; border-bottom: 1px solid var(--border); padding-bottom: 0.3rem; }
  h3 { font-size: 0.9rem; margin: 1rem 0 0.4rem; color: var(--accent); }
  small { font-weight: normal; color: var(--dim); }
  .dim { color: var(--dim); }
  .meta { font-size: 0.8rem; color: var(--dim); margin-bottom: 1.5rem; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 0.25rem 0.5rem; font-size: 0.85rem; border-bottom: 1px solid var(--border); }
  .type { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; padding: 0.1rem 0.4rem; border-radius: 3px; background: var(--surface); }
  ul { list-style: none; padding: 0; }
  li { padding: 0.3rem 0; font-size: 0.85rem; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .timeline li { border-left: 2px solid var(--border); padding-left: 0.8rem; margin-left: 0.5rem; }
  section { margin-bottom: 1rem; }
</style>
</head>
<body>
<h1>${escapeHtml(config.name)} — ${escapeHtml(tabLabel)}</h1>
<p class="meta">Exported ${new Date().toISOString().split("T")[0]} · ${tabArtifacts.length} artifacts · ${tabGroups.length} groups</p>
${panelSections}
${groupSections}
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${tab}-export.html"`,
    },
  });
}
