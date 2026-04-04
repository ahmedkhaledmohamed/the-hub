import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const PREFS_DIR = join(process.cwd(), ".hub-data");
const PREFS_FILE = join(PREFS_DIR, "preferences.json");

export interface HubPreferences {
  hygieneExclude?: string[];
  scannerExclude?: string[];
}

export function readPreferences(): HubPreferences {
  try {
    if (!existsSync(PREFS_FILE)) return {};
    return JSON.parse(readFileSync(PREFS_FILE, "utf8"));
  } catch {
    return {};
  }
}

export function writePreferences(prefs: HubPreferences): void {
  if (!existsSync(PREFS_DIR)) mkdirSync(PREFS_DIR, { recursive: true });
  writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 2));
}
