export type TaskStatus =
  | "planning"
  | "inbox"
  | "assigned"
  | "in_progress"
  | "testing"
  | "review"
  | "done"
  | "blocked";

export type TaskPriority = "low" | "normal" | "high" | "urgent";

export interface TaskRecord {
  taskId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedAgentId?: string;
  createdBy?: string;
  dueAt?: string;
  deletedAt?: string;
  deletedBy?: string;
  deleteReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskCreateInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignedAgentId?: string;
  createdBy?: string;
  dueAt?: string;
}

export interface TaskUpdateInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignedAgentId?: string | null;
  dueAt?: string;
}

export type TaskActivityType =
  | "spawned"
  | "updated"
  | "completed"
  | "file_created"
  | "status_changed"
  | "comment";

export interface TaskActivityRecord {
  activityId: string;
  taskId: string;
  agentId?: string;
  activityType: TaskActivityType;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface TaskActivityCreateInput {
  agentId?: string;
  activityType: TaskActivityType;
  message: string;
  metadata?: Record<string, unknown>;
}

export type TaskDeliverableType = "file" | "url" | "artifact";

export interface TaskDeliverableRecord {
  deliverableId: string;
  taskId: string;
  deliverableType: TaskDeliverableType;
  title: string;
  path?: string;
  description?: string;
  createdAt: string;
}

export interface TaskDeliverableCreateInput {
  deliverableType: TaskDeliverableType;
  title: string;
  path?: string;
  description?: string;
}

export type SubagentSessionStatus = "active" | "completed" | "failed" | "killed";

export interface TaskSubagentSession {
  subagentSessionId: string;
  taskId: string;
  agentSessionId: string;
  agentName?: string;
  status: SubagentSessionStatus;
  createdAt: string;
  updatedAt: string;
  endedAt?: string;
}

export interface TaskSubagentCreateInput {
  agentSessionId: string;
  agentName?: string;
}

export interface TaskSubagentUpdateInput {
  status?: SubagentSessionStatus;
  endedAt?: string;
}
