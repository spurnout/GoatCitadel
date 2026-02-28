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
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync): void {
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
      openclaw_session_id TEXT NOT NULL UNIQUE,
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
  `);

  migrateApprovalsColumns(db);
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
