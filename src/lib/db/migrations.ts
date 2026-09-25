import type Database from "better-sqlite3";

type Migration = Readonly<{ version: number; sql: string }>;

const migrations: readonly Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL COLLATE NOCASE,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
        failed_login_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
        locked_until TEXT,
        disabled_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX users_username_nocase ON users(username COLLATE NOCASE);

      CREATE TABLE sessions (
        id_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT
      );
      CREATE INDEX sessions_user_id ON sessions(user_id);
      CREATE INDEX sessions_expires_at ON sessions(expires_at);

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by TEXT REFERENCES users(id) ON DELETE SET NULL
      );
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE activity_events (
        id TEXT PRIMARY KEY,
        occurred_at TEXT NOT NULL,
        actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'anonymous', 'system')),
        action TEXT NOT NULL,
        paths_json TEXT NOT NULL,
        operation_id TEXT,
        outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure')),
        error_code TEXT,
        metadata_json TEXT NOT NULL
      );
      CREATE INDEX activity_events_occurred_at ON activity_events(occurred_at DESC, id DESC);
      CREATE INDEX activity_events_actor_user_id ON activity_events(actor_user_id);
    `,
  },
  {
    version: 3,
    sql: `
      CREATE TABLE recycle_entries (
        id TEXT PRIMARY KEY,
        original_path TEXT NOT NULL,
        storage_key TEXT NOT NULL UNIQUE,
        item_type TEXT NOT NULL CHECK (item_type IN ('file', 'folder')),
        size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
        deleted_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        deleted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        operation_id TEXT,
        restored_at TEXT,
        restored_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        expired_at TEXT,
        purged_at TEXT,
        purged_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        metadata_json TEXT NOT NULL
      );
      CREATE INDEX recycle_entries_active ON recycle_entries(expires_at)
        WHERE restored_at IS NULL AND expired_at IS NULL AND purged_at IS NULL;
      CREATE INDEX recycle_entries_original_path ON recycle_entries(original_path);
    `,
  },
  {
    version: 4,
    sql: `
      CREATE TABLE file_operations (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('pending', 'completed', 'failed', 'recovery_required')),
        actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        paths_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        error_code TEXT
      );
      CREATE INDEX file_operations_state ON file_operations(state, created_at);
      CREATE TABLE operation_path_locks (
        path TEXT PRIMARY KEY,
        operation_id TEXT NOT NULL REFERENCES file_operations(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL
      );
      CREATE INDEX operation_path_locks_operation_id ON operation_path_locks(operation_id);
      CREATE TABLE file_versions (
        id TEXT PRIMARY KEY,
        original_path TEXT NOT NULL,
        storage_key TEXT NOT NULL UNIQUE,
        size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
        created_at TEXT NOT NULL,
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        operation_id TEXT REFERENCES file_operations(id) ON DELETE SET NULL,
        metadata_json TEXT NOT NULL
      );
      CREATE INDEX file_versions_original_path ON file_versions(original_path, created_at DESC);
    `,
  },
  {
    version: 5,
    sql: `
      CREATE TABLE file_index_entries (
        logical_path TEXT PRIMARY KEY,
        parent_path TEXT NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('file', 'folder')),
        size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
        modified_at TEXT NOT NULL,
        extension TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        text_indexed INTEGER NOT NULL CHECK (text_indexed IN (0, 1)),
        generation INTEGER NOT NULL CHECK (generation >= 0),
        indexed_at TEXT NOT NULL
      );
      CREATE INDEX file_index_entries_parent_path ON file_index_entries(parent_path);
      CREATE INDEX file_index_entries_generation ON file_index_entries(generation);

      CREATE TABLE file_index_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        generation INTEGER NOT NULL CHECK (generation >= 0),
        cursor TEXT,
        status TEXT NOT NULL CHECK (status IN ('idle', 'running', 'error')),
        error TEXT,
        updated_at TEXT NOT NULL
      );
      INSERT INTO file_index_state (id, generation, cursor, status, error, updated_at)
        VALUES (1, 0, NULL, 'idle', NULL, CURRENT_TIMESTAMP);

      CREATE VIRTUAL TABLE file_index_fts USING fts5(
        logical_path UNINDEXED,
        name,
        text_content
      );

      CREATE TABLE user_favorites (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        logical_path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (user_id, logical_path)
      );
      CREATE INDEX user_favorites_created_at ON user_favorites(user_id, created_at DESC);

      CREATE TABLE user_recent_items (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        logical_path TEXT NOT NULL,
        accessed_at TEXT NOT NULL,
        PRIMARY KEY (user_id, logical_path)
      );
      CREATE INDEX user_recent_items_accessed_at ON user_recent_items(user_id, accessed_at DESC);
    `,
  },
  {
    version: 6,
    sql: `
      ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0
        CHECK (must_change_password IN (0, 1));
      INSERT OR IGNORE INTO settings (key, value_json, updated_at, updated_by)
        VALUES ('require_sign_in', 'true', CURRENT_TIMESTAMP, NULL);
      INSERT OR IGNORE INTO settings (key, value_json, updated_at, updated_by)
        VALUES ('anonymous_access_expires_at', 'null', CURRENT_TIMESTAMP, NULL);
      INSERT OR IGNORE INTO settings (key, value_json, updated_at, updated_by)
        VALUES ('anonymous_access_reason', 'null', CURRENT_TIMESTAMP, NULL);
      INSERT OR IGNORE INTO settings (key, value_json, updated_at, updated_by)
        VALUES ('recycle_retention_days', '30', CURRENT_TIMESTAMP, NULL);
    `,
  },
  {
    version: 7,
    sql: `
      CREATE TABLE terminal_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT
      );
      CREATE INDEX terminal_tokens_user_id ON terminal_tokens(user_id);
      CREATE INDEX terminal_tokens_expires_at ON terminal_tokens(expires_at);
    `,
  },
];

export function migrate(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const applied = new Set(
    database
      .prepare("SELECT version FROM schema_migrations")
      .all()
      .map((row) => (row as { version: number }).version)
  );

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    try {
      database.transaction(() => {
        database.exec(migration.sql);
        database
          .prepare(
            "INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)"
          )
          .run(migration.version, new Date().toISOString());
      })();
    } catch (error) {
      throw new Error(
        `Failed to apply database migration ${migration.version}`,
        {
          cause: error,
        }
      );
    }
  }
}
