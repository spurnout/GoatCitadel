import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface SqliteOptions {
  dbPath: string;
}

export function ensureParentDir(filePath: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

export function createDatabase(options: SqliteOptions): DatabaseSync {
  ensureParentDir(options.dbPath);
  const db = new DatabaseSync(options.dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA synchronous = NORMAL;");
  db.exec("PRAGMA busy_timeout = 5000;");
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = db.prepare("SELECT version FROM schema_migrations ORDER BY version ASC").all() as Array<{ version: number }>;
  const applied = new Set(appliedRows.map((row) => row.version));
  const markApplied = db.prepare(`
    INSERT INTO schema_migrations (version, name, applied_at)
    VALUES (@version, @name, @appliedAt)
  `);

  for (const migration of SCHEMA_MIGRATIONS) {
    if (applied.has(migration.version)) {
      continue;
    }

    db.exec("BEGIN IMMEDIATE");
    try {
      migration.up(db);
      markApplied.run({
        version: migration.version,
        name: migration.name,
        appliedAt: new Date().toISOString(),
      });
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

interface SchemaMigration {
  version: number;
  name: string;
  up: (db: DatabaseSync) => void;
}

const SCHEMA_MIGRATIONS: SchemaMigration[] = [
  {
    version: 1,
    name: "base_schema",
    up: createBaseSchema,
  },
  {
    version: 2,
    name: "approval_explainer_columns",
    up: migrateApprovalsColumns,
  },
  {
    version: 3,
    name: "task_subagent_agent_session_rename",
    up: migrateTaskSubagentSessionColumns,
  },
  {
    version: 4,
    name: "drop_legacy_integration_index",
    up: (db) => {
      db.exec("DROP INDEX IF EXISTS idx_integration_connections_catalog_label");
    },
  },
  {
    version: 5,
    name: "mesh_schema",
    up: createMeshSchema,
  },
  {
    version: 6,
    name: "memory_qmd_schema",
    up: createMemoryQmdSchema,
  },
  {
    version: 7,
    name: "task_soft_delete_columns",
    up: migrateTaskSoftDeleteColumns,
  },
  {
    version: 8,
    name: "agent_profiles_schema",
    up: createAgentProfilesSchema,
  },
  {
    version: 9,
    name: "native_tools_expansion_schema",
    up: createNativeToolsExpansionSchema,
  },
  {
    version: 10,
    name: "chat_workspace_schema",
    up: createChatWorkspaceSchema,
  },
  {
    version: 11,
    name: "system_settings_schema",
    up: createSystemSettingsSchema,
  },
  {
    version: 12,
    name: "v11_expansion_schema",
    up: createV11ExpansionSchema,
  },
  {
    version: 13,
    name: "agentic_chat_schema",
    up: createAgenticChatSchema,
  },
  {
    version: 14,
    name: "prompt_pack_readiness_schema",
    up: createPromptPackReadinessSchema,
  },
  {
    version: 15,
    name: "skill_runtime_state_schema",
    up: createSkillRuntimeStateSchema,
  },
  {
    version: 16,
    name: "bankr_safety_schema",
    up: createBankrSafetySchema,
  },
  {
    version: 17,
    name: "agentic_depth_schema",
    up: createAgenticDepthSchema,
  },
  {
    version: 18,
    name: "weekly_decision_replay_schema",
    up: createWeeklyDecisionReplaySchema,
  },
  {
    version: 19,
    name: "prompt_pack_benchmark_schema",
    up: createPromptPackBenchmarkSchema,
  },
  {
    version: 20,
    name: "workspace_isolation_schema",
    up: createWorkspaceIsolationSchema,
  },
];

function createBaseSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      session_key TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      channel TEXT NOT NULL,
      account TEXT NOT NULL,
      display_name TEXT,
      routing_hints_json TEXT,
      last_activity_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      health TEXT NOT NULL DEFAULT 'healthy',
      token_input INTEGER NOT NULL DEFAULT 0,
      token_output INTEGER NOT NULL DEFAULT 0,
      token_cached_input INTEGER NOT NULL DEFAULT 0,
      token_total INTEGER NOT NULL DEFAULT 0,
      cost_usd_total REAL NOT NULL DEFAULT 0,
      budget_state TEXT NOT NULL DEFAULT 'ok'
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_last_activity_at ON sessions(last_activity_at DESC);

    CREATE TABLE IF NOT EXISTS inbound_events (
      endpoint TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      event_id TEXT NOT NULL,
      session_key TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      received_at TEXT NOT NULL,
      processed_at TEXT,
      status TEXT NOT NULL,
      PRIMARY KEY (endpoint, idempotency_key)
    );

    CREATE TABLE IF NOT EXISTS approvals (
      approval_id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      status TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      preview_json TEXT NOT NULL,
      explanation_status TEXT NOT NULL DEFAULT 'not_requested',
      explanation_json TEXT,
      explanation_error TEXT,
      explanation_updated_at TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      resolved_by TEXT,
      resolution_note TEXT
    );

    CREATE TABLE IF NOT EXISTS approval_events (
      event_id TEXT PRIMARY KEY,
      approval_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_approval_events_approval_id ON approval_events(approval_id, timestamp);

    CREATE TABLE IF NOT EXISTS pending_approval_actions (
      approval_id TEXT PRIMARY KEY,
      action_type TEXT NOT NULL,
      request_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      resolution_status TEXT NOT NULL DEFAULT 'pending',
      result_json TEXT
    );

    CREATE TABLE IF NOT EXISTS tool_invocations (
      audit_event_id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      task_id TEXT,
      tool_name TEXT NOT NULL,
      outcome TEXT NOT NULL,
      policy_reason TEXT NOT NULL,
      args_json TEXT NOT NULL,
      result_json TEXT,
      approval_id TEXT
    );

    CREATE TABLE IF NOT EXISTS policy_blocks (
      audit_event_id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      reason TEXT NOT NULL,
      details_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cost_ledger (
      ledger_id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      agent_id TEXT,
      task_id TEXT,
      day TEXT NOT NULL,
      token_input INTEGER NOT NULL DEFAULT 0,
      token_output INTEGER NOT NULL DEFAULT 0,
      token_cached_input INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cost_ledger_day ON cost_ledger(day);
    CREATE INDEX IF NOT EXISTS idx_cost_ledger_session_id ON cost_ledger(session_id);

    CREATE TABLE IF NOT EXISTS tasks (
      task_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      assigned_agent_id TEXT,
      created_by TEXT,
      due_at TEXT,
      deleted_at TEXT,
      deleted_by TEXT,
      delete_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status_updated_at ON tasks(status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS task_activities (
      activity_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      agent_id TEXT,
      activity_type TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_task_activities_task_created_at
      ON task_activities(task_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS task_deliverables (
      deliverable_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      deliverable_type TEXT NOT NULL,
      title TEXT NOT NULL,
      path TEXT,
      description TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_task_deliverables_task_created_at
      ON task_deliverables(task_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS task_subagent_sessions (
      subagent_session_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      agent_session_id TEXT NOT NULL UNIQUE,
      agent_name TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      ended_at TEXT,
      FOREIGN KEY(task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_task_subagent_sessions_task_created_at
      ON task_subagent_sessions(task_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_task_subagent_sessions_status
      ON task_subagent_sessions(status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS realtime_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      source TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_realtime_events_created_at
      ON realtime_events(created_at DESC);

    CREATE TABLE IF NOT EXISTS cron_jobs (
      job_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      schedule TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at TEXT,
      next_run_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skills_index (
      skill_id TEXT PRIMARY KEY,
      skill_name TEXT NOT NULL,
      source TEXT NOT NULL,
      dir TEXT NOT NULL,
      mtime TEXT NOT NULL,
      declared_tools_json TEXT NOT NULL,
      requires_json TEXT NOT NULL,
      keywords_json TEXT NOT NULL,
      usage_count INTEGER NOT NULL DEFAULT 0,
      avg_quality_score REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS orchestration_runs (
      run_id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      current_wave_id TEXT,
      current_phase_id TEXT,
      total_cost_usd REAL NOT NULL DEFAULT 0,
      total_iterations INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_orchestration_runs_plan_id ON orchestration_runs(plan_id, started_at DESC);

    CREATE TABLE IF NOT EXISTS orchestration_plans (
      plan_id TEXT PRIMARY KEY,
      plan_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orchestration_checkpoints (
      checkpoint_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      wave_id TEXT,
      phase_id TEXT,
      checkpoint_kind TEXT NOT NULL,
      git_ref TEXT,
      details_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_orchestration_checkpoints_run_id
      ON orchestration_checkpoints(run_id, created_at);

    CREATE TABLE IF NOT EXISTS orchestration_events (
      event_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_orchestration_events_run_id
      ON orchestration_events(run_id, created_at);

    CREATE TABLE IF NOT EXISTS integration_connections (
      connection_id TEXT PRIMARY KEY,
      catalog_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      integration_key TEXT NOT NULL,
      label TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL,
      config_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_sync_at TEXT,
      last_error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_integration_connections_kind
      ON integration_connections(kind, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_integration_connections_catalog_id
      ON integration_connections(catalog_id, updated_at DESC);
  `);
}

function createMeshSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mesh_nodes (
      node_id TEXT PRIMARY KEY,
      label TEXT,
      advertise_address TEXT,
      transport TEXT NOT NULL,
      status TEXT NOT NULL,
      capabilities_json TEXT NOT NULL,
      tls_fingerprint TEXT,
      joined_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mesh_nodes_status
      ON mesh_nodes(status, last_seen_at DESC);

    CREATE TABLE IF NOT EXISTS mesh_leases (
      lease_key TEXT PRIMARY KEY,
      holder_node_id TEXT NOT NULL,
      fencing_token INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mesh_leases_expires_at
      ON mesh_leases(expires_at);

    CREATE TABLE IF NOT EXISTS mesh_session_owners (
      session_id TEXT PRIMARY KEY,
      owner_node_id TEXT NOT NULL,
      epoch INTEGER NOT NULL,
      claimed_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mesh_session_owners_owner
      ON mesh_session_owners(owner_node_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS mesh_replication_log (
      replication_id TEXT PRIMARY KEY,
      source_node_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(source_node_id, idempotency_key)
    );

    CREATE INDEX IF NOT EXISTS idx_mesh_replication_log_created_at
      ON mesh_replication_log(created_at DESC);

    CREATE TABLE IF NOT EXISTS mesh_replication_offsets (
      consumer_node_id TEXT NOT NULL,
      source_node_id TEXT NOT NULL,
      last_replication_id TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (consumer_node_id, source_node_id)
    );

    CREATE TABLE IF NOT EXISTS mesh_join_tokens (
      token_hash TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      used_by_node_id TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_mesh_join_tokens_expires_at
      ON mesh_join_tokens(expires_at);
  `);
}

function createMemoryQmdSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_context_packs (
      context_id TEXT PRIMARY KEY,
      cache_key TEXT NOT NULL UNIQUE,
      scope TEXT NOT NULL,
      session_id TEXT,
      task_id TEXT,
      run_id TEXT,
      phase_id TEXT,
      query_hash TEXT NOT NULL,
      sources_hash TEXT NOT NULL,
      context_text TEXT NOT NULL,
      citations_json TEXT NOT NULL,
      quality_json TEXT NOT NULL,
      original_token_estimate INTEGER NOT NULL,
      distilled_token_estimate INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_memory_context_packs_session
      ON memory_context_packs(session_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_memory_context_packs_run_phase
      ON memory_context_packs(run_id, phase_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_memory_context_packs_created_at
      ON memory_context_packs(created_at DESC);

    CREATE TABLE IF NOT EXISTS memory_qmd_runs (
      run_event_id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      session_id TEXT,
      task_id TEXT,
      run_id TEXT,
      phase_id TEXT,
      status TEXT NOT NULL,
      provider_id TEXT,
      model TEXT,
      duration_ms INTEGER NOT NULL,
      candidate_count INTEGER NOT NULL,
      citations_count INTEGER NOT NULL,
      original_token_estimate INTEGER NOT NULL,
      distilled_token_estimate INTEGER NOT NULL,
      savings_percent REAL NOT NULL,
      error_text TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_memory_qmd_runs_created_at
      ON memory_qmd_runs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_memory_qmd_runs_scope
      ON memory_qmd_runs(scope, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_memory_qmd_runs_session
      ON memory_qmd_runs(session_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_memory_qmd_runs_run_phase
      ON memory_qmd_runs(run_id, phase_id, created_at DESC);
  `);
}

function migrateApprovalsColumns(db: DatabaseSync): void {
  const rows = db.prepare("PRAGMA table_info(approvals)").all() as Array<{ name: string }>;
  const columns = new Set(rows.map((row) => row.name));

  if (!columns.has("explanation_status")) {
    db.exec("ALTER TABLE approvals ADD COLUMN explanation_status TEXT NOT NULL DEFAULT 'not_requested'");
  }
  if (!columns.has("explanation_json")) {
    db.exec("ALTER TABLE approvals ADD COLUMN explanation_json TEXT");
  }
  if (!columns.has("explanation_error")) {
    db.exec("ALTER TABLE approvals ADD COLUMN explanation_error TEXT");
  }
  if (!columns.has("explanation_updated_at")) {
    db.exec("ALTER TABLE approvals ADD COLUMN explanation_updated_at TEXT");
  }
}

function migrateTaskSubagentSessionColumns(db: DatabaseSync): void {
  const rows = db.prepare("PRAGMA table_info(task_subagent_sessions)").all() as Array<{ name: string }>;
  const columns = new Set(rows.map((row) => row.name));

  if (columns.has("agent_session_id")) {
    return;
  }

  if (!columns.has("openclaw_session_id")) {
    return;
  }

  try {
    db.exec("ALTER TABLE task_subagent_sessions RENAME COLUMN openclaw_session_id TO agent_session_id");
    return;
  } catch {
    // Fall back to table rebuild if RENAME COLUMN is not available.
  }

  db.exec(`
    CREATE TABLE task_subagent_sessions_new (
      subagent_session_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      agent_session_id TEXT NOT NULL UNIQUE,
      agent_name TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      ended_at TEXT,
      FOREIGN KEY(task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
    );

    INSERT INTO task_subagent_sessions_new (
      subagent_session_id, task_id, agent_session_id, agent_name, status, created_at, updated_at, ended_at
    )
    SELECT
      subagent_session_id, task_id, openclaw_session_id, agent_name, status, created_at, updated_at, ended_at
    FROM task_subagent_sessions;

    DROP TABLE task_subagent_sessions;
    ALTER TABLE task_subagent_sessions_new RENAME TO task_subagent_sessions;

    CREATE INDEX IF NOT EXISTS idx_task_subagent_sessions_task_created_at
      ON task_subagent_sessions(task_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_task_subagent_sessions_status
      ON task_subagent_sessions(status, updated_at DESC);
  `);
}

function migrateTaskSoftDeleteColumns(db: DatabaseSync): void {
  const rows = db.prepare("PRAGMA table_info(tasks)").all() as Array<{ name: string }>;
  const columns = new Set(rows.map((row) => row.name));

  if (!columns.has("deleted_at")) {
    db.exec("ALTER TABLE tasks ADD COLUMN deleted_at TEXT");
  }
  if (!columns.has("deleted_by")) {
    db.exec("ALTER TABLE tasks ADD COLUMN deleted_by TEXT");
  }
  if (!columns.has("delete_reason")) {
    db.exec("ALTER TABLE tasks ADD COLUMN delete_reason TEXT");
  }
}

function createAgentProfilesSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_profiles (
      agent_id TEXT PRIMARY KEY,
      role_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      specialties_json TEXT NOT NULL,
      default_tools_json TEXT NOT NULL,
      aliases_json TEXT NOT NULL,
      is_builtin INTEGER NOT NULL,
      lifecycle_status TEXT NOT NULL DEFAULT 'active',
      archived_at TEXT,
      archived_by TEXT,
      archive_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_agent_profiles_lifecycle_status
      ON agent_profiles(lifecycle_status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_profiles_role_id
      ON agent_profiles(role_id);
  `);
}

function createNativeToolsExpansionSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tool_grants (
      grant_id TEXT PRIMARY KEY,
      tool_pattern TEXT NOT NULL,
      decision TEXT NOT NULL,
      scope TEXT NOT NULL,
      scope_ref TEXT NOT NULL,
      grant_type TEXT NOT NULL,
      constraints_json TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT,
      revoked_at TEXT,
      uses_remaining INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_tool_grants_scope
      ON tool_grants(scope, scope_ref, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tool_grants_pattern
      ON tool_grants(tool_pattern, created_at DESC);

    CREATE TABLE IF NOT EXISTS tool_access_decisions (
      decision_id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      task_id TEXT,
      allowed INTEGER NOT NULL,
      reason_codes_json TEXT NOT NULL,
      matched_grant_id TEXT,
      requires_approval INTEGER NOT NULL,
      risk_level TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tool_access_decisions_tool_time
      ON tool_access_decisions(tool_name, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_tool_access_decisions_agent_time
      ON tool_access_decisions(agent_id, timestamp DESC);

    CREATE TABLE IF NOT EXISTS knowledge_documents (
      doc_id TEXT PRIMARY KEY,
      namespace TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      title TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_knowledge_documents_namespace_time
      ON knowledge_documents(namespace, created_at DESC);

    CREATE TABLE IF NOT EXISTS knowledge_chunks (
      chunk_id TEXT PRIMARY KEY,
      doc_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      content TEXT NOT NULL,
      embedding_json TEXT,
      token_estimate INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(doc_id) REFERENCES knowledge_documents(doc_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_doc_seq
      ON knowledge_chunks(doc_id, seq);
    CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_created_at
      ON knowledge_chunks(created_at DESC);

    CREATE TABLE IF NOT EXISTS comms_deliveries (
      delivery_id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL,
      channel_key TEXT NOT NULL,
      target TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      status TEXT NOT NULL,
      provider_msg_id TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_comms_deliveries_connection_time
      ON comms_deliveries(connection_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_comms_deliveries_channel_time
      ON comms_deliveries(channel_key, created_at DESC);
  `);
}

function createChatWorkspaceSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_projects (
      project_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      workspace_path TEXT NOT NULL,
      color TEXT,
      lifecycle_status TEXT NOT NULL DEFAULT 'active',
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chat_projects_updated_at
      ON chat_projects(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_projects_lifecycle
      ON chat_projects(lifecycle_status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS chat_session_meta (
      session_id TEXT PRIMARY KEY,
      title TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      lifecycle_status TEXT NOT NULL DEFAULT 'active',
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chat_session_meta_updated_at
      ON chat_session_meta(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_session_meta_lifecycle
      ON chat_session_meta(lifecycle_status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_session_meta_pinned
      ON chat_session_meta(pinned DESC, updated_at DESC);

    CREATE TABLE IF NOT EXISTS chat_session_projects (
      session_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      assigned_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES chat_projects(project_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chat_session_projects_project
      ON chat_session_projects(project_id, assigned_at DESC);

    CREATE TABLE IF NOT EXISTS chat_session_bindings (
      session_id TEXT PRIMARY KEY,
      transport TEXT NOT NULL,
      connection_id TEXT,
      target_json TEXT,
      writable INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_attachments (
      attachment_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      project_id TEXT,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      storage_rel_path TEXT NOT NULL,
      extract_status TEXT NOT NULL,
      extract_preview TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES chat_projects(project_id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chat_attachments_session
      ON chat_attachments(session_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_attachments_project
      ON chat_attachments(project_id, created_at DESC);
  `);
}

function createSystemSettingsSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_settings (
      setting_key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function createV11ExpansionSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mcp_servers (
      server_id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      transport TEXT NOT NULL,
      command TEXT,
      args_json TEXT,
      url TEXT,
      auth_type TEXT NOT NULL DEFAULT 'none',
      enabled INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'disconnected',
      last_error TEXT,
      last_connected_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mcp_servers_updated
      ON mcp_servers(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_mcp_servers_enabled
      ON mcp_servers(enabled, updated_at DESC);

    CREATE TABLE IF NOT EXISTS mcp_server_auth (
      server_id TEXT PRIMARY KEY,
      access_token_ref TEXT,
      refresh_token_ref TEXT,
      token_expires_at TEXT,
      oauth_state TEXT,
      scopes_json TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(server_id) REFERENCES mcp_servers(server_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mcp_tools_cache (
      cache_id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      description TEXT,
      input_schema_json TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      UNIQUE(server_id, tool_name),
      FOREIGN KEY(server_id) REFERENCES mcp_servers(server_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_mcp_tools_cache_server
      ON mcp_tools_cache(server_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS media_jobs (
      job_id TEXT PRIMARY KEY,
      session_id TEXT,
      attachment_id TEXT,
      job_type TEXT NOT NULL,
      status TEXT NOT NULL,
      input_json TEXT,
      output_json TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_media_jobs_session
      ON media_jobs(session_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_media_jobs_attachment
      ON media_jobs(attachment_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_media_jobs_status
      ON media_jobs(status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS media_artifacts (
      artifact_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      attachment_id TEXT,
      kind TEXT NOT NULL,
      storage_rel_path TEXT,
      text_preview TEXT,
      mime_type TEXT,
      size_bytes INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY(job_id) REFERENCES media_jobs(job_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_media_artifacts_job
      ON media_artifacts(job_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS voice_sessions (
      voice_session_id TEXT PRIMARY KEY,
      talk_session_id TEXT,
      mode TEXT NOT NULL,
      state TEXT NOT NULL,
      session_id TEXT,
      payload_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_voice_sessions_updated
      ON voice_sessions(updated_at DESC);

    CREATE TABLE IF NOT EXISTS voice_wake_profiles (
      profile_id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      model TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      sensitivity REAL,
      payload_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_voice_wake_profiles_enabled
      ON voice_wake_profiles(enabled, updated_at DESC);

    CREATE TABLE IF NOT EXISTS daemon_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      payload_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_daemon_events_created
      ON daemon_events(created_at DESC);
  `);

  addColumnIfMissing(db, "chat_attachments", "media_type", "TEXT");
  addColumnIfMissing(db, "chat_attachments", "thumbnail_rel_path", "TEXT");
  addColumnIfMissing(db, "chat_attachments", "ocr_text", "TEXT");
  addColumnIfMissing(db, "chat_attachments", "transcript_text", "TEXT");
  addColumnIfMissing(db, "chat_attachments", "analysis_status", "TEXT NOT NULL DEFAULT 'pending'");

  addColumnIfMissing(db, "integration_connections", "plugin_id", "TEXT");
  addColumnIfMissing(db, "integration_connections", "plugin_version", "TEXT");
  addColumnIfMissing(db, "integration_connections", "plugin_enabled", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "integration_connections", "plugin_meta_json", "TEXT");
}

function createAgenticChatSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_session_prefs (
      session_id TEXT PRIMARY KEY,
      mode TEXT NOT NULL DEFAULT 'chat',
      provider_id TEXT,
      model TEXT,
      web_mode TEXT NOT NULL DEFAULT 'auto',
      memory_mode TEXT NOT NULL DEFAULT 'auto',
      thinking_level TEXT NOT NULL DEFAULT 'standard',
      tool_autonomy TEXT NOT NULL DEFAULT 'safe_auto',
      vision_fallback_model TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chat_session_prefs_updated
      ON chat_session_prefs(updated_at DESC);

    CREATE TABLE IF NOT EXISTS chat_turn_traces (
      turn_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      user_message_id TEXT NOT NULL,
      assistant_message_id TEXT,
      status TEXT NOT NULL,
      mode TEXT NOT NULL,
      model TEXT,
      web_mode TEXT NOT NULL,
      memory_mode TEXT NOT NULL,
      thinking_level TEXT NOT NULL,
      routing_json TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_chat_turn_traces_session
      ON chat_turn_traces(session_id, started_at DESC);

    CREATE TABLE IF NOT EXISTS chat_tool_runs (
      tool_run_id TEXT PRIMARY KEY,
      turn_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      status TEXT NOT NULL,
      approval_id TEXT,
      args_json TEXT,
      result_json TEXT,
      error TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_chat_tool_runs_turn
      ON chat_tool_runs(turn_id, started_at ASC);
    CREATE INDEX IF NOT EXISTS idx_chat_tool_runs_session
      ON chat_tool_runs(session_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_tool_runs_approval
      ON chat_tool_runs(approval_id);

    CREATE TABLE IF NOT EXISTS research_runs (
      run_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      query TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT,
      error TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_research_runs_session
      ON research_runs(session_id, started_at DESC);

    CREATE TABLE IF NOT EXISTS research_sources (
      source_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      title TEXT,
      url TEXT NOT NULL,
      snippet TEXT,
      rank INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_research_sources_run
      ON research_sources(run_id, rank ASC, created_at ASC);

    CREATE TABLE IF NOT EXISTS chat_inline_approvals (
      approval_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      turn_id TEXT NOT NULL,
      tool_name TEXT,
      status TEXT NOT NULL,
      reason TEXT,
      resolved_by TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_chat_inline_approvals_session
      ON chat_inline_approvals(session_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_inline_approvals_turn
      ON chat_inline_approvals(turn_id, created_at DESC);
  `);
}

function createPromptPackReadinessSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_delegation_runs (
      run_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      objective TEXT NOT NULL,
      roles_json TEXT NOT NULL,
      mode TEXT NOT NULL,
      provider_id TEXT,
      model TEXT,
      status TEXT NOT NULL,
      stitched_output TEXT,
      citations_json TEXT NOT NULL,
      trace_json TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_chat_delegation_runs_session
      ON chat_delegation_runs(session_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_delegation_runs_task
      ON chat_delegation_runs(task_id, started_at DESC);

    CREATE TABLE IF NOT EXISTS chat_delegation_steps (
      step_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      role TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      status TEXT NOT NULL,
      output TEXT,
      error TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      duration_ms INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_chat_delegation_steps_run
      ON chat_delegation_steps(run_id, step_index ASC, started_at ASC);

    CREATE TABLE IF NOT EXISTS prompt_packs (
      pack_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source_label TEXT,
      test_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_prompt_packs_updated
      ON prompt_packs(updated_at DESC);

    CREATE TABLE IF NOT EXISTS prompt_pack_tests (
      test_id TEXT PRIMARY KEY,
      pack_id TEXT NOT NULL,
      code TEXT NOT NULL,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_prompt_pack_tests_pack_code
      ON prompt_pack_tests(pack_id, code);
    CREATE INDEX IF NOT EXISTS idx_prompt_pack_tests_pack_order
      ON prompt_pack_tests(pack_id, order_index ASC, created_at ASC);

    CREATE TABLE IF NOT EXISTS prompt_pack_runs (
      run_id TEXT PRIMARY KEY,
      pack_id TEXT NOT NULL,
      test_id TEXT NOT NULL,
      session_id TEXT,
      status TEXT NOT NULL,
      provider_id TEXT,
      model TEXT,
      response_text TEXT,
      trace_json TEXT,
      citations_json TEXT,
      error TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_prompt_pack_runs_pack
      ON prompt_pack_runs(pack_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_prompt_pack_runs_test
      ON prompt_pack_runs(test_id, started_at DESC);

    CREATE TABLE IF NOT EXISTS prompt_pack_scores (
      score_id TEXT PRIMARY KEY,
      pack_id TEXT NOT NULL,
      test_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      routing_score INTEGER NOT NULL,
      honesty_score INTEGER NOT NULL,
      handoff_score INTEGER NOT NULL,
      robustness_score INTEGER NOT NULL,
      usability_score INTEGER NOT NULL,
      total_score INTEGER NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_prompt_pack_scores_pack_test
      ON prompt_pack_scores(pack_id, test_id, created_at DESC);
  `);
}

function createSkillRuntimeStateSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS skill_state (
      skill_id TEXT PRIMARY KEY,
      state TEXT NOT NULL DEFAULT 'enabled',
      note TEXT,
      updated_at TEXT NOT NULL,
      first_auto_approved_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_skill_state_state_updated
      ON skill_state(state, updated_at DESC);

    CREATE TABLE IF NOT EXISTS skill_activation_events (
      event_id TEXT PRIMARY KEY,
      skill_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_skill_activation_events_skill
      ON skill_activation_events(skill_id, created_at DESC);
  `);
}

function createBankrSafetySchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bankr_action_audit (
      action_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      chain TEXT,
      symbol TEXT,
      usd_estimate REAL,
      status TEXT NOT NULL,
      approval_id TEXT,
      policy_reason TEXT,
      details_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_bankr_action_audit_created
      ON bankr_action_audit(created_at DESC, action_id DESC);

    CREATE INDEX IF NOT EXISTS idx_bankr_action_audit_session
      ON bankr_action_audit(session_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS bankr_budget_usage_daily (
      day TEXT PRIMARY KEY,
      usd_total REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);
}

function createAgenticDepthSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_autonomy_prefs (
      session_id TEXT PRIMARY KEY,
      proactive_mode TEXT NOT NULL DEFAULT 'off',
      max_actions_per_hour INTEGER NOT NULL DEFAULT 6,
      max_actions_per_turn INTEGER NOT NULL DEFAULT 2,
      cooldown_seconds INTEGER NOT NULL DEFAULT 60,
      retrieval_mode TEXT NOT NULL DEFAULT 'standard',
      reflection_mode TEXT NOT NULL DEFAULT 'off',
      last_proactive_at TEXT,
      last_proactive_run_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_session_autonomy_prefs_updated
      ON session_autonomy_prefs(updated_at DESC);

    CREATE TABLE IF NOT EXISTS proactive_runs (
      run_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      status TEXT NOT NULL,
      mode TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0,
      reasoning_summary TEXT,
      action_count INTEGER NOT NULL DEFAULT 0,
      suggested_actions_json TEXT NOT NULL,
      executed_actions_json TEXT NOT NULL,
      error TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_proactive_runs_session_created
      ON proactive_runs(session_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_proactive_runs_status
      ON proactive_runs(status, started_at DESC);

    CREATE TABLE IF NOT EXISTS proactive_actions (
      action_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      tool_name TEXT,
      args_json TEXT,
      result_json TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_proactive_actions_session_created
      ON proactive_actions(session_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_proactive_actions_run
      ON proactive_actions(run_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_proactive_actions_status
      ON proactive_actions(status, created_at DESC);

    CREATE TABLE IF NOT EXISTS learned_memory_items (
      item_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      item_type TEXT NOT NULL,
      content TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.5,
      status TEXT NOT NULL DEFAULT 'active',
      superseded_by_item_id TEXT,
      redacted INTEGER NOT NULL DEFAULT 0,
      disabled_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_learned_memory_items_session_created
      ON learned_memory_items(session_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_learned_memory_items_type
      ON learned_memory_items(item_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_learned_memory_items_status
      ON learned_memory_items(status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS learned_memory_sources (
      source_id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      snippet TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_learned_memory_sources_item
      ON learned_memory_sources(item_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS learned_memory_conflicts (
      conflict_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      item_type TEXT NOT NULL,
      existing_item_id TEXT,
      incoming_item_id TEXT,
      incoming_content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      resolution_note TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_learned_memory_conflicts_session
      ON learned_memory_conflicts(session_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_learned_memory_conflicts_status
      ON learned_memory_conflicts(status, created_at DESC);

    CREATE TABLE IF NOT EXISTS chat_reflection_attempts (
      attempt_id TEXT PRIMARY KEY,
      turn_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      outcome TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 1,
      strategy TEXT,
      error TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chat_reflection_attempts_turn
      ON chat_reflection_attempts(turn_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_reflection_attempts_session
      ON chat_reflection_attempts(session_id, created_at DESC);
  `);

  addColumnIfMissing(db, "chat_turn_traces", "retrieval_json", "TEXT");
  addColumnIfMissing(db, "chat_turn_traces", "reflection_json", "TEXT");
  addColumnIfMissing(db, "chat_turn_traces", "proactive_json", "TEXT");
}

function createWeeklyDecisionReplaySchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS decision_replay_runs (
      run_id TEXT PRIMARY KEY,
      trigger_mode TEXT NOT NULL,
      sample_size INTEGER NOT NULL DEFAULT 500,
      window_start TEXT NOT NULL,
      window_end TEXT NOT NULL,
      status TEXT NOT NULL,
      report_id TEXT,
      total_candidates INTEGER NOT NULL DEFAULT 0,
      total_scored INTEGER NOT NULL DEFAULT 0,
      likely_wrong_count INTEGER NOT NULL DEFAULT 0,
      model_judged_count INTEGER NOT NULL DEFAULT 0,
      error_text TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_decision_replay_runs_started
      ON decision_replay_runs(started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_decision_replay_runs_status
      ON decision_replay_runs(status, started_at DESC);

    CREATE TABLE IF NOT EXISTS decision_replay_items (
      item_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      decision_type TEXT NOT NULL,
      session_id TEXT,
      turn_id TEXT,
      tool_run_id TEXT,
      occurred_at TEXT NOT NULL,
      wrongness_probability REAL NOT NULL DEFAULT 0,
      label TEXT NOT NULL,
      cause_class TEXT NOT NULL,
      cluster_key TEXT NOT NULL,
      rule_scores_json TEXT NOT NULL,
      model_scores_json TEXT,
      evidence_json TEXT NOT NULL,
      summary_text TEXT,
      input_excerpt TEXT,
      output_excerpt TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES decision_replay_runs(run_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_decision_replay_items_run_wrongness
      ON decision_replay_items(run_id, wrongness_probability DESC, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_decision_replay_items_cause
      ON decision_replay_items(cause_class, label, occurred_at DESC);

    CREATE TABLE IF NOT EXISTS decision_replay_findings (
      finding_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      cause_class TEXT NOT NULL,
      cluster_key TEXT NOT NULL,
      severity TEXT NOT NULL,
      recurrence_count INTEGER NOT NULL DEFAULT 0,
      impacted_sessions INTEGER NOT NULL DEFAULT 0,
      impacted_turns INTEGER NOT NULL DEFAULT 0,
      avg_wrongness REAL NOT NULL DEFAULT 0,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      recommendation TEXT,
      is_duplicate INTEGER NOT NULL DEFAULT 0,
      duplicate_of_fingerprint TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES decision_replay_runs(run_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_decision_replay_findings_run
      ON decision_replay_findings(run_id, is_duplicate, recurrence_count DESC);
    CREATE INDEX IF NOT EXISTS idx_decision_replay_findings_fingerprint
      ON decision_replay_findings(fingerprint, created_at DESC);

    CREATE TABLE IF NOT EXISTS decision_autotunes (
      tune_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      finding_id TEXT,
      tune_class TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      status TEXT NOT NULL,
      description TEXT NOT NULL,
      patch_json TEXT NOT NULL,
      snapshot_json TEXT,
      result_json TEXT,
      created_at TEXT NOT NULL,
      applied_at TEXT,
      reverted_at TEXT,
      FOREIGN KEY(run_id) REFERENCES decision_replay_runs(run_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_decision_autotunes_run_status
      ON decision_autotunes(run_id, status, created_at DESC);

    CREATE TABLE IF NOT EXISTS improvement_reports (
      report_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      week_start TEXT NOT NULL,
      week_end TEXT NOT NULL,
      summary_json TEXT NOT NULL,
      top_findings_json TEXT NOT NULL,
      applied_tunes_json TEXT NOT NULL,
      queued_tunes_json TEXT NOT NULL,
      week_over_week_json TEXT NOT NULL,
      previous_report_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES decision_replay_runs(run_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_improvement_reports_week
      ON improvement_reports(week_end DESC, created_at DESC);

    CREATE TABLE IF NOT EXISTS decision_replay_dedup (
      fingerprint TEXT PRIMARY KEY,
      last_seen_report_id TEXT,
      last_seen_at TEXT NOT NULL,
      occurrence_count INTEGER NOT NULL DEFAULT 1,
      last_summary_hash TEXT
    );
  `);
}

function createPromptPackBenchmarkSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS prompt_pack_benchmark_runs (
      benchmark_run_id TEXT PRIMARY KEY,
      pack_id TEXT NOT NULL,
      status TEXT NOT NULL,
      test_codes_json TEXT NOT NULL,
      providers_json TEXT NOT NULL,
      total_items INTEGER NOT NULL DEFAULT 0,
      completed_items INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_prompt_pack_benchmark_runs_pack_started
      ON prompt_pack_benchmark_runs(pack_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_prompt_pack_benchmark_runs_status
      ON prompt_pack_benchmark_runs(status, started_at DESC);

    CREATE TABLE IF NOT EXISTS prompt_pack_benchmark_items (
      item_id TEXT PRIMARY KEY,
      benchmark_run_id TEXT NOT NULL,
      pack_id TEXT NOT NULL,
      test_id TEXT NOT NULL,
      test_code TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      model TEXT NOT NULL,
      run_id TEXT,
      score_id TEXT,
      run_status TEXT NOT NULL,
      total_score INTEGER,
      failure_signal TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(benchmark_run_id) REFERENCES prompt_pack_benchmark_runs(benchmark_run_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_prompt_pack_benchmark_items_run
      ON prompt_pack_benchmark_items(benchmark_run_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_prompt_pack_benchmark_items_model
      ON prompt_pack_benchmark_items(provider_id, model, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_prompt_pack_benchmark_items_test
      ON prompt_pack_benchmark_items(test_code, created_at DESC);
  `);
}

function createWorkspaceIsolationSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      workspace_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      slug TEXT NOT NULL,
      lifecycle_status TEXT NOT NULL DEFAULT 'active',
      archived_at TEXT,
      workspace_prefs_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_slug_unique
      ON workspaces(slug);
    CREATE INDEX IF NOT EXISTS idx_workspaces_updated
      ON workspaces(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_workspaces_lifecycle
      ON workspaces(lifecycle_status, updated_at DESC);
  `);

  addColumnIfMissing(db, "chat_projects", "workspace_id", "TEXT NOT NULL DEFAULT 'default'");
  addColumnIfMissing(db, "chat_session_meta", "workspace_id", "TEXT NOT NULL DEFAULT 'default'");
  addColumnIfMissing(db, "chat_session_bindings", "workspace_id", "TEXT NOT NULL DEFAULT 'default'");
  addColumnIfMissing(db, "chat_attachments", "workspace_id", "TEXT NOT NULL DEFAULT 'default'");
  addColumnIfMissing(db, "chat_turn_traces", "guidance_json", "TEXT");
  addColumnIfMissing(db, "tasks", "workspace_id", "TEXT NOT NULL DEFAULT 'default'");

  db.exec(`
    UPDATE chat_projects SET workspace_id = 'default' WHERE workspace_id IS NULL OR TRIM(workspace_id) = '';
    UPDATE chat_session_meta SET workspace_id = 'default' WHERE workspace_id IS NULL OR TRIM(workspace_id) = '';
    UPDATE chat_session_bindings SET workspace_id = 'default' WHERE workspace_id IS NULL OR TRIM(workspace_id) = '';
    UPDATE chat_attachments SET workspace_id = 'default' WHERE workspace_id IS NULL OR TRIM(workspace_id) = '';
    UPDATE tasks SET workspace_id = 'default' WHERE workspace_id IS NULL OR TRIM(workspace_id) = '';

    CREATE INDEX IF NOT EXISTS idx_chat_projects_workspace_updated
      ON chat_projects(workspace_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_session_meta_workspace_updated
      ON chat_session_meta(workspace_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_session_bindings_workspace_updated
      ON chat_session_bindings(workspace_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_attachments_workspace_created
      ON chat_attachments(workspace_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tasks_workspace_updated
      ON tasks(workspace_id, updated_at DESC);

    INSERT INTO workspaces (
      workspace_id, name, description, slug, lifecycle_status, archived_at, workspace_prefs_json, created_at, updated_at
    )
    VALUES (
      'default',
      'Default Workspace',
      'Auto-migrated workspace for existing GoatCitadel data.',
      'default',
      'active',
      NULL,
      '{}',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT(workspace_id) DO UPDATE SET
      name = CASE WHEN COALESCE(TRIM(workspaces.name), '') = '' THEN excluded.name ELSE workspaces.name END,
      slug = CASE WHEN COALESCE(TRIM(workspaces.slug), '') = '' THEN excluded.slug ELSE workspaces.slug END,
      updated_at = CASE WHEN workspaces.updated_at IS NULL THEN excluded.updated_at ELSE workspaces.updated_at END;
  `);
}

function addColumnIfMissing(db: DatabaseSync, tableName: string, columnName: string, columnSql: string): void {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  const columns = new Set(rows.map((row) => row.name));
  if (!columns.has(columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnSql}`);
  }
}
