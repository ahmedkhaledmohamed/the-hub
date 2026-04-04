import { NextResponse } from "next/server";
import { readdirSync, statSync } from "fs";
import { join, resolve, basename } from "path";
import { loadConfig } from "@/lib/config";
import { readPreferences } from "@/lib/preferences";
import { getManifest } from "@/lib/manifest-store";

export const dynamic = "force-dynamic";

interface DirectoryInfo {
  name: string;
  workspace: string;
  status: "active" | "config-skip" | "pref-skip";
  artifactCount: number;
}

function resolveHomePath(p: string): string {
  if (p.startsWith("~/")) return join(process.env.HOME || "/", p.slice(2));
  return resolve(p);
}

export async function GET() {
  const config = loadConfig();
  const prefs = readPreferences();
  const manifest = getManifest();

  const configSkipDirs = new Set(config.scanner?.skipDirs || []);
  const prefSkipDirs = new Set(prefs.scannerExclude || []);

  const artifactsByDir: Record<string, number> = {};
  for (const a of manifest.artifacts) {
    const parts = a.path.split("/");
    if (parts.length >= 3) {
      const dir = parts[1];
      artifactsByDir[dir] = (artifactsByDir[dir] || 0) + 1;
    }
  }

  const directories: DirectoryInfo[] = [];

  for (const ws of config.workspaces) {
    const wsPath = resolveHomePath(ws.path);
    const wsLabel = ws.label || basename(wsPath);

    let entries: string[];
    try {
      entries = readdirSync(wsPath);
    } catch {
      continue;
    }

    for (const name of entries) {
      if (name.startsWith(".")) continue;

      let stat;
      try {
        stat = statSync(join(wsPath, name));
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;

      let status: DirectoryInfo["status"] = "active";
      if (configSkipDirs.has(name)) {
        status = "config-skip";
      } else if (prefSkipDirs.has(name)) {
        status = "pref-skip";
      }

      directories.push({
        name,
        workspace: wsLabel,
        status,
        artifactCount: artifactsByDir[name] || 0,
      });
    }
  }

  directories.sort((a, b) => {
    if (a.status !== b.status) {
      const order = { active: 0, "pref-skip": 1, "config-skip": 2 };
      return (order[a.status] || 0) - (order[b.status] || 0);
    }
    return a.name.localeCompare(b.name);
  });

  return NextResponse.json({
    workspaces: config.workspaces.map((w) => ({ path: w.path, label: w.label })),
    scanner: {
      extensions: config.scanner?.extensions || [".html", ".svg", ".md", ".csv"],
      skipDirs: config.scanner?.skipDirs || [],
      skipPaths: config.scanner?.skipPaths || [],
    },
    directories,
    preferences: prefs,
    artifactCount: manifest.artifacts.length,
  });
}
