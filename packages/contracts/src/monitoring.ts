import type { SessionMeta } from "./session.js";

export type RealtimeEventType =
  | "session_event"
  | "tool_invoked"
  | "approval_created"
  | "approval_resolved"
  | "approval_explained"
  | "task_created"
  | "task_updated"
  | "task_deleted"
  | "activity_logged"
  | "deliverable_added"
  | "subagent_registered"
  | "subagent_updated"
  | "orchestration_event"
  | "system";

export interface RealtimeEvent {
  eventId: string;
  eventType: RealtimeEventType | string;
  source: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface TaskStatusCount {
  status: string;
  count: number;
}

export interface SystemVitals {
  hostname: string;
  platform: string;
  release: string;
  uptimeSeconds: number;
  loadAverage: number[];
  cpuCount: number;
  memoryTotalBytes: number;
  memoryFreeBytes: number;
  memoryUsedBytes: number;
  processRssBytes: number;
  processHeapUsedBytes: number;
}

export interface DashboardState {
  timestamp: string;
  sessions: SessionMeta[];
  pendingApprovals: number;
  activeSubagents: number;
  taskStatusCounts: TaskStatusCount[];
  recentEvents: RealtimeEvent[];
  dailyCostUsd: number;
}

export interface CronJobRecord {
  jobId: string;
  name: string;
  schedule: string;
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  updatedAt?: string;
}

export interface OperatorSummary {
  operatorId: string;
  sessionCount: number;
  activeSessions: number;
  lastActivityAt?: string;
}
