import { useEffect, useMemo, useRef, useState } from "react";
import {
  addTaskActivity,
  addTaskDeliverable,
  createTask,
  deleteTask,
  fetchAgents,
  fetchSessions,
  fetchTaskActivities,
  fetchTaskDeliverables,
  fetchTasksByView,
  fetchTaskSubagents,
  registerTaskSubagent,
  restoreTask,
  updateTask,
  updateTaskSubagent,
  type TaskActivityRecord,
  type TaskDeliverableRecord,
  type TaskRecord,
  type TaskSubagentSession,
} from "../api/client";
import { PageGuideCard } from "../components/PageGuideCard";
import { SelectOrCustom } from "../components/SelectOrCustom";
import { ConfirmModal } from "../components/ConfirmModal";
import { TableSkeleton } from "../components/TableSkeleton";
import { GCSelect } from "../components/ui";
import { BUILTIN_AGENT_ROSTER } from "../data/agent-roster";
import { useAction } from "../hooks/useAction";
import { pageCopy } from "../content/copy";

const statuses: TaskRecord["status"][] = [
  "inbox",
  "assigned",
  "in_progress",
  "testing",
  "review",
  "done",
  "blocked",
];

const TASK_TITLE_OPTIONS = [
  "Implement feature request",
  "Fix regression bug",
  "Refactor module boundary",
  "Add integration tests",
  "Prepare release checklist",
].map((value) => ({ value, label: value }));

const ACTIVITY_OPTIONS = [
  "Started implementation",
  "Completed initial draft",
  "Blocked by dependency",
  "Requested review",
  "Validated acceptance criteria",
].map((value) => ({ value, label: value }));

const DELIVERABLE_TITLE_OPTIONS = [
  "Code patch",
  "Test report",
  "Architecture notes",
  "Release notes",
  "Verification logs",
].map((value) => ({ value, label: value }));

const DELIVERABLE_PATH_OPTIONS = [
  "docs/notes.md",
  "docs/architecture.md",
  "artifacts/report.txt",
  "tests/results.md",
  "src/",
].map((value) => ({ value, label: value }));

export function TasksPage({ refreshKey = 0, workspaceId = "default" }: { refreshKey?: number; workspaceId?: string }) {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>();
  const [activities, setActivities] = useState<TaskActivityRecord[]>([]);
  const [deliverables, setDeliverables] = useState<TaskDeliverableRecord[]>([]);
  const [subagents, setSubagents] = useState<TaskSubagentSession[]>([]);
  const [viewFilter, setViewFilter] = useState<"active" | "trash" | "all">("active");
  const [createTitle, setCreateTitle] = useState("");
  const [activityMessage, setActivityMessage] = useState("");
  const [deliverableTitle, setDeliverableTitle] = useState("");
  const [deliverablePath, setDeliverablePath] = useState("");
  const [subagentSessionId, setSubagentSessionId] = useState("");
  const [subagentRoleId, setSubagentRoleId] = useState(BUILTIN_AGENT_ROSTER[0]?.roleId ?? "");
  const [subagentName, setSubagentName] = useState(BUILTIN_AGENT_ROSTER[0]?.name ?? "");
  const [agentProfiles, setAgentProfiles] = useState<Array<{ roleId: string; name: string; title: string }>>([]);
  const [sessionHints, setSessionHints] = useState<string[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{
    task: TaskRecord;
    mode: "soft" | "hard";
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const detailRequestSeq = useRef(0);
  const deleteAction = useAction();

  const selectedTask = useMemo(
    () => tasks.find((task) => task.taskId === selectedTaskId),
    [selectedTaskId, tasks],
  );

  const isSelectedTaskDeleted = Boolean(selectedTask?.deletedAt);
  const canCreateTask = createTitle.trim().length > 0;
  const canAddActivity = Boolean(selectedTask) && !isSelectedTaskDeleted && activityMessage.trim().length > 0;
  const canAddDeliverable = Boolean(selectedTask) && !isSelectedTaskDeleted && deliverableTitle.trim().length > 0;
  const canAddSubagent = Boolean(selectedTask) && !isSelectedTaskDeleted && subagentSessionId.trim().length > 0;

  const loadTasks = () => {
    setLoadingTasks(true);
    void fetchTasksByView(viewFilter, undefined, workspaceId)
      .then((res) => {
        setTasks(res.items);
        setSelectedTaskId((current) => {
          if (current && res.items.some((item) => item.taskId === current)) {
            return current;
          }
          return res.items[0]?.taskId;
        });
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoadingTasks(false));
  };

  const loadTaskDetail = (taskId: string) => {
    const requestId = ++detailRequestSeq.current;
    void Promise.all([
      fetchTaskActivities(taskId),
      fetchTaskDeliverables(taskId),
      fetchTaskSubagents(taskId),
    ])
      .then(([a, d, s]) => {
        if (requestId !== detailRequestSeq.current) {
          return;
        }
        setActivities(a.items);
        setDeliverables(d.items);
        setSubagents(s.items);
      })
      .catch((err: Error) => setError(err.message));
  };

  useEffect(() => {
    loadTasks();
  }, [refreshKey, viewFilter, workspaceId]);

  useEffect(() => {
    void fetchSessions()
      .then((res) => setSessionHints(res.items.map((item) => item.sessionId)))
      .catch((err: Error) => setError(err.message));
  }, [refreshKey]);

  useEffect(() => {
    void fetchAgents("active", 500)
      .then((res) => {
        setAgentProfiles(res.items.map((agent) => ({
          roleId: agent.roleId,
          name: agent.name,
          title: agent.title,
        })));
      })
      .catch(() => {
        // keep builtin fallback
      });
  }, [refreshKey]);

  useEffect(() => {
    if (!selectedTaskId) {
      return;
    }
    loadTaskDetail(selectedTaskId);
  }, [selectedTaskId, refreshKey]);

  const onCreateTask = async () => {
    if (!createTitle.trim()) {
      setError("Enter a task title before creating a task.");
      return;
    }

    try {
      await createTask({ workspaceId, title: createTitle.trim() });
      setCreateTitle("");
      setInfo("Task created.");
      loadTasks();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onStatusChange = async (status: TaskRecord["status"]) => {
    if (!selectedTask || isSelectedTaskDeleted) {
      return;
    }

    try {
      await updateTask(selectedTask.taskId, { status });
      setInfo(`Task moved to ${status}.`);
      loadTasks();
      loadTaskDetail(selectedTask.taskId);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onAddActivity = async () => {
    if (!selectedTask) {
      setError("Select a task before adding activity.");
      return;
    }
    if (isSelectedTaskDeleted) {
      setError("Restore this task before adding activity.");
      return;
    }
    if (!activityMessage.trim()) {
      setError("Enter or select an activity message first.");
      return;
    }
    try {
      await addTaskActivity(selectedTask.taskId, {
        activityType: "comment",
        message: activityMessage.trim(),
      });
      setActivityMessage("");
      setInfo("Activity added.");
      loadTaskDetail(selectedTask.taskId);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onAddDeliverable = async () => {
    if (!selectedTask) {
      setError("Select a task before adding a deliverable.");
      return;
    }
    if (isSelectedTaskDeleted) {
      setError("Restore this task before adding deliverables.");
      return;
    }
    if (!deliverableTitle.trim()) {
      setError("Enter or select a deliverable title first.");
      return;
    }

    try {
      await addTaskDeliverable(selectedTask.taskId, {
        title: deliverableTitle.trim(),
        deliverableType: deliverablePath.trim() ? "file" : "artifact",
        path: deliverablePath.trim() || undefined,
      });
      setDeliverableTitle("");
      setDeliverablePath("");
      setInfo("Deliverable added.");
      loadTaskDetail(selectedTask.taskId);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onAddSubagent = async () => {
    if (!selectedTask) {
      setError("Select a task before linking a subagent session.");
      return;
    }
    if (isSelectedTaskDeleted) {
      setError("Restore this task before linking subagent sessions.");
      return;
    }
    if (!subagentSessionId.trim()) {
      setError("Choose or enter a subagent session ID first.");
      return;
    }

    try {
      await registerTaskSubagent(selectedTask.taskId, {
        agentSessionId: subagentSessionId.trim(),
        agentName: subagentName.trim() || undefined,
      });
      setSubagentSessionId("");
      setInfo("Subagent linked to task.");
      loadTaskDetail(selectedTask.taskId);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onCompleteSubagent = async (sessionId: string) => {
    if (!selectedTask || isSelectedTaskDeleted) {
      return;
    }
    try {
      await updateTaskSubagent(sessionId, {
        status: "completed",
      });
      setInfo("Subagent marked completed.");
      loadTaskDetail(selectedTask.taskId);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onMoveToTrash = async (task: TaskRecord) => {
    try {
      await deleteAction.run(async () => deleteTask(task.taskId, {
        mode: "soft",
        deletedBy: "mission-control",
        deleteReason: "Operator requested cleanup",
      }));
      setInfo("Task moved to Trash.");
      loadTasks();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onRestore = async (task: TaskRecord) => {
    try {
      await restoreTask(task.taskId);
      setInfo("Task restored.");
      loadTasks();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onPermanentDelete = async (task: TaskRecord) => {
    try {
      await deleteAction.run(async () => deleteTask(task.taskId, {
        mode: "hard",
        confirmToken: "PERMANENT_DELETE",
      }));
      setInfo("Task permanently deleted.");
      loadTasks();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const subagentSessionOptions = useMemo(() => {
    const values = new Set<string>([
      ...sessionHints,
      ...subagents.map((session) => session.agentSessionId),
    ]);
    return [...values].filter(Boolean).map((value) => ({ value, label: value }));
  }, [sessionHints, subagents]);

  const subagentRoleOptions = useMemo(
    () => {
      if (agentProfiles.length > 0) {
        return agentProfiles.map((agent) => ({ value: agent.roleId, label: `${agent.name} (${agent.title})` }));
      }
      return BUILTIN_AGENT_ROSTER.map((agent) => ({ value: agent.roleId, label: `${agent.name} (${agent.title})` }));
    },
    [agentProfiles],
  );

  const subagentNameOptions = useMemo(() => {
    const values = new Set<string>([
      ...(agentProfiles.length > 0 ? agentProfiles.map((agent) => agent.name) : BUILTIN_AGENT_ROSTER.map((agent) => agent.name)),
      ...subagents.map((session) => session.agentName).filter(Boolean) as string[],
    ]);
    return [...values].map((value) => ({ value, label: value }));
  }, [agentProfiles, subagents]);

  return (
    <section>
      <h2>{pageCopy.tasks.title}</h2>
      <p className="office-subtitle">{pageCopy.tasks.subtitle}</p>
      <PageGuideCard
        what={pageCopy.tasks.guide?.what ?? ""}
        when={pageCopy.tasks.guide?.when ?? ""}
        actions={pageCopy.tasks.guide?.actions ?? []}
        terms={pageCopy.tasks.guide?.terms}
      />
      {error ? <p className="error">{error}</p> : null}
      {info ? <p className="office-subtitle">{info}</p> : null}

      <div className="controls-row">
        <label htmlFor="taskView">View</label>
        <GCSelect
          id="taskView"
          value={viewFilter}
          onChange={(value) => setViewFilter(value as "active" | "trash" | "all")}
          options={[
            { value: "active", label: "Active" },
            { value: "trash", label: "Trash" },
            { value: "all", label: "All" },
          ]}
        />
      </div>

      <div className="controls-row">
        <SelectOrCustom
          value={createTitle}
          onChange={setCreateTitle}
          options={TASK_TITLE_OPTIONS}
          customPlaceholder="Custom task title"
          customLabel="Task title"
          autoSelectFirstOption
        />
        <button type="button" onClick={onCreateTask} disabled={!canCreateTask}>Create Task</button>
      </div>

      {loadingTasks ? <TableSkeleton rows={6} cols={5} /> : null}
      <div className="split-grid">
        <div>
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr
                  key={task.taskId}
                  className={task.taskId === selectedTaskId ? "row-selected" : ""}
                >
                  <td onClick={() => setSelectedTaskId(task.taskId)}>
                    {task.title}
                    {task.deletedAt ? <span className="office-subtitle"> (trashed)</span> : null}
                  </td>
                  <td onClick={() => setSelectedTaskId(task.taskId)}>{task.status}</td>
                  <td onClick={() => setSelectedTaskId(task.taskId)}>{task.priority}</td>
                  <td onClick={() => setSelectedTaskId(task.taskId)}>{new Date(task.updatedAt).toLocaleString()}</td>
                  <td className="actions">
                    {!task.deletedAt ? (
                      <button type="button" onClick={() => setConfirmDelete({ task, mode: "soft" })}>Move to Trash</button>
                    ) : (
                      <button type="button" onClick={() => void onRestore(task)}>Restore</button>
                    )}
                    <button
                      type="button"
                      className="danger"
                      onClick={() => setConfirmDelete({ task, mode: "hard" })}
                      disabled={deleteAction.pending}
                    >
                      Delete Permanently
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          {!selectedTask ? <p>Select a task to inspect details.</p> : null}
          {selectedTask ? (
            <article className="card">
              <h3>{selectedTask.title}</h3>
              <p>{selectedTask.description || "No description yet."}</p>
              {selectedTask.deletedAt ? (
                <p className="office-subtitle">
                  In Trash since {new Date(selectedTask.deletedAt).toLocaleString()}
                  {selectedTask.deleteReason ? ` (${selectedTask.deleteReason})` : ""}
                </p>
              ) : null}

              <div className="controls-row">
                <span>Status:</span>
                {statuses.map((status) => (
                  <button
                    key={status}
                    className={selectedTask.status === status ? "active" : ""}
                    disabled={isSelectedTaskDeleted}
                    onClick={() => void onStatusChange(status)}
                  >
                    {status}
                  </button>
                ))}
              </div>

              <h4>Activities</h4>
              <div className="controls-row">
                <SelectOrCustom
                  value={activityMessage}
                  onChange={setActivityMessage}
                  options={ACTIVITY_OPTIONS}
                  customPlaceholder="Custom activity message"
                  customLabel="Activity message"
                  autoSelectFirstOption
                />
                <button type="button" disabled={!canAddActivity} onClick={() => void onAddActivity()}>Add Activity</button>
              </div>
              <ul className="compact-list">
                {activities.map((activity) => (
                  <li key={activity.activityId}>
                    <strong>{activity.activityType}</strong> - {activity.message}
                    <small> ({new Date(activity.createdAt).toLocaleString()})</small>
                  </li>
                ))}
              </ul>

              <h4>Deliverables</h4>
              <div className="controls-row">
                <SelectOrCustom
                  value={deliverableTitle}
                  onChange={setDeliverableTitle}
                  options={DELIVERABLE_TITLE_OPTIONS}
                  customPlaceholder="Custom deliverable title"
                  customLabel="Deliverable title"
                  autoSelectFirstOption
                />
                <SelectOrCustom
                  value={deliverablePath}
                  onChange={setDeliverablePath}
                  options={DELIVERABLE_PATH_OPTIONS}
                  customPlaceholder="Optional custom path"
                  customLabel="Deliverable path"
                />
                <button type="button" disabled={!canAddDeliverable} onClick={() => void onAddDeliverable()}>Add Deliverable</button>
              </div>
              <ul className="compact-list">
                {deliverables.map((deliverable) => (
                  <li key={deliverable.deliverableId}>
                    <strong>{deliverable.title}</strong>
                    {deliverable.path ? ` - ${deliverable.path}` : ""}
                  </li>
                ))}
              </ul>

              <h4>Goat Subagent Sessions</h4>
              <div className="controls-row">
                <SelectOrCustom
                  value={subagentSessionId}
                  onChange={setSubagentSessionId}
                  options={subagentSessionOptions}
                  customPlaceholder="Session id"
                  customLabel="Session id"
                  autoSelectFirstOption
                />
                <SelectOrCustom
                  value={subagentRoleId}
                  onChange={(nextRoleId) => {
                    setSubagentRoleId(nextRoleId);
                    const role = (
                      agentProfiles.length > 0
                        ? agentProfiles.find((item) => item.roleId === nextRoleId)
                        : BUILTIN_AGENT_ROSTER.find((item) => item.roleId === nextRoleId)
                    );
                    if (role) {
                      setSubagentName(role.name);
                    }
                  }}
                  options={subagentRoleOptions}
                  customPlaceholder="Optional role id"
                  customLabel="Role id"
                />
                <SelectOrCustom
                  value={subagentName}
                  onChange={setSubagentName}
                  options={subagentNameOptions}
                  customPlaceholder="Optional agent name"
                  customLabel="Agent name"
                />
                <button type="button" disabled={!canAddSubagent} onClick={() => void onAddSubagent()}>Add Subagent</button>
              </div>
              <button type="button" onClick={() => setShowAdvanced((current) => !current)}>
                {showAdvanced ? "Hide advanced subagent details" : "Show advanced subagent details"}
              </button>
              {showAdvanced ? (
                <p className="office-subtitle">
                  Advanced mode lets you provide arbitrary session IDs and custom names for external sessions.
                </p>
              ) : null}
              <ul className="compact-list">
                {subagents.map((session) => (
                  <li key={session.subagentSessionId}>
                    <strong>{session.agentName ?? session.agentSessionId}</strong> - {session.status}
                    {session.status === "active" ? (
                      <button type="button" disabled={isSelectedTaskDeleted} onClick={() => void onCompleteSubagent(session.agentSessionId)}>Mark Completed</button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </article>
          ) : null}
        </div>
      </div>
      <ConfirmModal
        open={Boolean(confirmDelete)}
        title={confirmDelete?.mode === "soft" ? "Move Task To Trash" : "Delete Task Permanently"}
        message={
          confirmDelete?.mode === "soft"
            ? `Move "${confirmDelete?.task.title ?? "this task"}" to Trash?`
            : `Permanently delete "${confirmDelete?.task.title}"? This cannot be undone.`
        }
        confirmLabel={deleteAction.pending ? "Applying..." : (confirmDelete?.mode === "soft" ? "Move to Trash" : "Delete Permanently")}
        danger={confirmDelete?.mode === "hard"}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (!confirmDelete) {
            return;
          }
          const task = confirmDelete.task;
          const mode = confirmDelete.mode;
          setConfirmDelete(null);
          void (mode === "soft" ? onMoveToTrash(task) : onPermanentDelete(task));
        }}
      />
    </section>
  );
}
