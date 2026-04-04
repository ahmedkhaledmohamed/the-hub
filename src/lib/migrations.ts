/**
 * Database migration system — versioned schema with automatic upgrades.
 *
 * Migrations run automatically on startup. Each migration is idempotent
 * (safe to run multiple times). Version is tracked in a `schema_version`
 * table in SQLite.
 *
 * To add a new migration:
 * 1. Add a new entry to the MIGRATIONS array
 * 2. Increment the version number
 * 3. Write the SQL (use IF NOT EXISTS / IF EXISTS for safety)
 */

import Database from "better-sqlite3";

// ── Types ──────────────────────────────────────────────────────────

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

// ── Migrations registry ────────────────────────────────────────────

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "initial-schema",
    sql: `
      -- Core artifacts table
      CREATE TABLE IF NOT EXISTS artifacts (
        path TEXT PRIMARY KEY, title TEXT NOT NULL, type TEXT NOT NULL,
        "group" TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
        hash TEXT NOT NULL DEFAULT '', modified_at TEXT NOT NULL,
        size INTEGER NOT NULL DEFAULT 0, stale_days INTEGER NOT NULL DEFAULT 0,
        snippet TEXT, indexed_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- FTS5 search index
      CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
        path, title, content, snippet, content='artifacts', content_rowid='rowid'
      );

      -- User state
      CREATE TABLE IF NOT EXISTS user_state (
        key TEXT PRIMARY KEY, value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- File mtime cache
      CREATE TABLE IF NOT EXISTS file_mtimes (
        path TEXT PRIMARY KEY, mtime_ms INTEGER NOT NULL, size INTEGER NOT NULL DEFAULT 0
      );
    `,
  },
  {
    version: 2,
    name: "ai-cache-and-summaries",
    sql: `
      CREATE TABLE IF NOT EXISTS ai_cache (
        cache_key TEXT PRIMARY KEY, response TEXT NOT NULL, model TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')), expires_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS summaries (
        content_hash TEXT PRIMARY KEY, summary TEXT NOT NULL, model TEXT NOT NULL,
        word_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
  {
    version: 3,
    name: "knowledge-graph-and-trends",
    sql: `
      CREATE TABLE IF NOT EXISTS artifact_links (
        source_path TEXT NOT NULL, target_path TEXT NOT NULL, link_type TEXT NOT NULL DEFAULT 'references',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (source_path, target_path, link_type)
      );
      CREATE INDEX IF NOT EXISTS idx_links_target ON artifact_links(target_path);

      CREATE TABLE IF NOT EXISTS daily_snapshots (
        date TEXT PRIMARY KEY, total_artifacts INTEGER NOT NULL,
        fresh_count INTEGER NOT NULL DEFAULT 0, aging_count INTEGER NOT NULL DEFAULT 0,
        stale_count INTEGER NOT NULL DEFAULT 0, group_counts TEXT NOT NULL DEFAULT '{}',
        group_stale TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
  {
    version: 4,
    name: "activity-and-embeddings",
    sql: `
      CREATE TABLE IF NOT EXISTS artifact_opens (
        id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL,
        opened_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_opens_path ON artifact_opens(path);

      CREATE TABLE IF NOT EXISTS search_queries (
        id INTEGER PRIMARY KEY AUTOINCREMENT, query TEXT NOT NULL,
        result_count INTEGER NOT NULL DEFAULT 0, clicked_path TEXT,
        searched_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS embeddings (
        content_hash TEXT PRIMARY KEY, path TEXT NOT NULL,
        chunk_index INTEGER NOT NULL DEFAULT 0, embedding TEXT NOT NULL,
        dimensions INTEGER NOT NULL, model TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_embeddings_path ON embeddings(path);
    `,
  },
  {
    version: 5,
    name: "platform-tables",
    sql: `
      CREATE TABLE IF NOT EXISTS agent_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL,
        type TEXT NOT NULL, content TEXT NOT NULL, metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS agent_runs (
        agent_id TEXT PRIMARY KEY, last_run TEXT NOT NULL DEFAULT (datetime('now')),
        run_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_name TEXT NOT NULL DEFAULT 'system',
        action TEXT NOT NULL, resource TEXT, details TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS compliance_tags (
        path TEXT NOT NULL, tag TEXT NOT NULL, applied_by TEXT NOT NULL DEFAULT 'manual',
        created_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (path, tag)
      );
      CREATE TABLE IF NOT EXISTS retention_queue (
        path TEXT PRIMARY KEY, stale_days INTEGER NOT NULL,
        action TEXT NOT NULL DEFAULT 'flag', flagged_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS user_activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_name TEXT NOT NULL, user_role TEXT NOT NULL,
        action TEXT NOT NULL, path TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
  {
    version: 6,
    name: "jobs-and-annotations",
    sql: `
      CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL,
        payload TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'pending',
        result TEXT, error TEXT, attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        started_at TEXT, completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

      CREATE TABLE IF NOT EXISTS annotations (
        id INTEGER PRIMARY KEY AUTOINCREMENT, artifact_path TEXT NOT NULL,
        author TEXT NOT NULL DEFAULT 'anonymous', content TEXT NOT NULL,
        line_start INTEGER, line_end INTEGER, parent_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (parent_id) REFERENCES annotations(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_annotations_path ON annotations(artifact_path);
    `,
  },
];

// ── Migration engine ───────────────────────────────────────────────

function ensureVersionTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

export function getCurrentVersion(db: Database.Database): number {
  ensureVersionTable(db);
  const row = db.prepare("SELECT MAX(version) as version FROM schema_version").get() as { version: number | null };
  return row?.version || 0;
}

export function getAppliedMigrations(db: Database.Database): Array<{ version: number; name: string; appliedAt: string }> {
  ensureVersionTable(db);
  return db.prepare("SELECT version, name, applied_at as appliedAt FROM schema_version ORDER BY version").all() as Array<{
    version: number; name: string; appliedAt: string;
  }>;
}

export function runMigrations(db: Database.Database): { applied: number; currentVersion: number } {
  ensureVersionTable(db);
  const current = getCurrentVersion(db);
  let applied = 0;

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;

    try {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_version (version, name) VALUES (?, ?)").run(migration.version, migration.name);
      applied++;
      console.log(`[migrations] Applied v${migration.version}: ${migration.name}`);
    } catch (err) {
      console.error(`[migrations] Failed v${migration.version} (${migration.name}):`, err);
      // Stop on failure — don't skip migrations
      break;
    }
  }

  const newVersion = getCurrentVersion(db);
  if (applied > 0) {
    console.log(`[migrations] Database at v${newVersion} (${applied} migration(s) applied)`);
  }

  return { applied, currentVersion: newVersion };
}

export function getLatestVersion(): number {
  return MIGRATIONS.length > 0 ? MIGRATIONS[MIGRATIONS.length - 1].version : 0;
}

export function getPendingMigrations(db: Database.Database): Migration[] {
  const current = getCurrentVersion(db);
  return MIGRATIONS.filter((m) => m.version > current);
}
