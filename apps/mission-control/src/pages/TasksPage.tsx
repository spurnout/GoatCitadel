import { useEffect, useMemo, useRef, useState } from "react";
import {
  addTaskActivity,
  addTaskDeliverable,
  createTask,
  fetchSessions,
  fetchTaskActivities,
  fetchTaskDeliverables,
  fetchTasks,
  fetchTaskSubagents,
  registerTaskSubagent,
  updateTask,
  updateTaskSubagent,
  type TaskActivityRecord,
  type TaskDeliverableRecord,
  type TaskRecord,
  type TaskSubagentSession,
} from "../api/client";
import { SelectOrCustom } from "../components/SelectOrCustom";
import { BUILTIN_AGENT_ROSTER } from "../data/agent-roster";

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

export function TasksPage({ refreshKey = 0 }: { refreshKey?: number }) {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>();
  const [activities, setActivities] = useState<TaskActivityRecord[]>([]);
  const [deliverables, setDeliverables] = useState<TaskDeliverableRecord[]>([]);
  const [subagents, setSubagents] = useState<TaskSubagentSession[]>([]);
  const [createTitle, setCreateTitle] = useState("");
  const [activityMessage, setActivityMessage] = useState("");
  const [deliverableTitle, setDeliverableTitle] = useState("");
  const [deliverablePath, setDeliverablePath] = useState("");
  const [subagentSessionId, setSubagentSessionId] = useState("");
  const [subagentName, setSubagentName] = useState("");
  const [sessionHints, setSessionHints] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const detailRequestSeq = useRef(0);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.taskId === selectedTaskId),
    [selectedTaskId, tasks],
  );

  const loadTasks = () => {
    void fetchTasks()
      .then((res) => {
        setTasks(res.items);
        setSelectedTaskId((current) => current ?? res.items[0]?.taskId);
      })
      .catch((err: Error) => setError(err.message));
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
  }, [refreshKey]);

  useEffect(() => {
    void fetchSessions()
      .then((res) => setSessionHints(res.items.map((item) => item.sessionId)))
      .catch((err: Error) => setError(err.message));
  }, [refreshKey]);

  useEffect(() => {
    if (!selectedTaskId) {
      return;
    }
    loadTaskDetail(selectedTaskId);
  }, [selectedTaskId, refreshKey]);

  const onCreateTask = async () => {
    if (!createTitle.trim()) {
      return;
    }

    try {
      await createTask({ title: createTitle.trim() });
      setCreateTitle("");
      loadTasks();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onStatusChange = async (status: TaskRecord["status"]) => {
    if (!selectedTask) {
      return;
    }

    try {
      await updateTask(selectedTask.taskId, { status });
      loadTasks();
      loadTaskDetail(selectedTask.taskId);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onAddActivity = async () => {
    if (!selectedTask || !activityMessage.trim()) {
      return;
    }
    try {
      await addTaskActivity(selectedTask.taskId, {
        activityType: "comment",
        message: activityMessage.trim(),
      });
      setActivityMessage("");
      loadTaskDetail(selectedTask.taskId);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onAddDeliverable = async () => {
    if (!selectedTask || !deliverableTitle.trim()) {
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
      loadTaskDetail(selectedTask.taskId);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onRegisterSubagent = async () => {
    if (!selectedTask || !subagentSessionId.trim()) {
      return;
    }

    try {
      await registerTaskSubagent(selectedTask.taskId, {
        agentSessionId: subagentSessionId.trim(),
        agentName: subagentName.trim() || undefined,
      });
      setSubagentSessionId("");
      setSubagentName("");
      loadTaskDetail(selectedTask.taskId);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onCompleteSubagent = async (sessionId: string) => {
    if (!selectedTask) {
      return;
    }
    try {
      await updateTaskSubagent(sessionId, {
        status: "completed",
      });
      loadTaskDetail(selectedTask.taskId);
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

  const subagentNameOptions = useMemo(() => {
    const values = new Set<string>([
      ...BUILTIN_AGENT_ROSTER.map((agent) => agent.name),
      ...subagents.map((session) => session.agentName).filter(Boolean) as string[],
    ]);
    return [...values].map((value) => ({ value, label: value }));
  }, [subagents]);

  return (
    <section>
      <h2>Trailboard</h2>
      <p className="office-subtitle">Plan and track work packets across the goat sub-agent roster.</p>
      {error ? <p className="error">{error}</p> : null}

      <div className="controls-row">
        <SelectOrCustom
          value={createTitle}
          onChange={setCreateTitle}
          options={TASK_TITLE_OPTIONS}
          customPlaceholder="Custom task title"
          customLabel="Task title"
        />
        <button onClick={onCreateTask}>Create Task</button>
      </div>

      <div className="split-grid">
        <div>
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr
                  key={task.taskId}
                  className={task.taskId === selectedTaskId ? "row-selected" : ""}
                  onClick={() => setSelectedTaskId(task.taskId)}
                >
                  <td>{task.title}</td>
                  <td>{task.status}</td>
                  <td>{task.priority}</td>
                  <td>{new Date(task.updatedAt).toLocaleString()}</td>
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
              <p>{selectedTask.description || "No description."}</p>

              <div className="controls-row">
                <span>Status:</span>
                {statuses.map((status) => (
                  <button
                    key={status}
                    className={selectedTask.status === status ? "active" : ""}
                    onClick={() => onStatusChange(status)}
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
                />
                <button onClick={onAddActivity}>Add</button>
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
                />
                <SelectOrCustom
                  value={deliverablePath}
                  onChange={setDeliverablePath}
                  options={DELIVERABLE_PATH_OPTIONS}
                  customPlaceholder="Optional custom path"
                  customLabel="Deliverable path"
                />
                <button onClick={onAddDeliverable}>Add</button>
              </div>
              <ul className="compact-list">
                {deliverables.map((deliverable) => (
                  <li key={deliverable.deliverableId}>
                    <strong>{deliverable.title}</strong>
                    {deliverable.path ? ` - ${deliverable.path}` : ""}
                  </li>
                ))}
              </ul>

              <h4>Goat Sub-Agent Sessions</h4>
              <div className="controls-row">
                <SelectOrCustom
                  value={subagentSessionId}
                  onChange={setSubagentSessionId}
                  options={subagentSessionOptions}
                  customPlaceholder="Session id"
                  customLabel="Session id"
                />
                <SelectOrCustom
                  value={subagentName}
                  onChange={setSubagentName}
                  options={subagentNameOptions}
                  customPlaceholder="Optional agent name"
                  customLabel="Agent name"
                />
                <button onClick={onRegisterSubagent}>Register</button>
              </div>
              <button onClick={() => setShowAdvanced((current) => !current)}>
                {showAdvanced ? "Hide advanced sub-agent details" : "Show advanced sub-agent details"}
              </button>
              {showAdvanced ? (
                <p className="office-subtitle">
                  Advanced mode lets you provide arbitrary session IDs and agent names. Use this for external sessions.
                </p>
              ) : null}
              <ul className="compact-list">
                {subagents.map((session) => (
                  <li key={session.subagentSessionId}>
                    <strong>{session.agentName ?? session.agentSessionId}</strong> - {session.status}
                    {session.status === "active" ? (
                      <button onClick={() => onCompleteSubagent(session.agentSessionId)}>Mark complete</button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </article>
          ) : null}
        </div>
      </div>
    </section>
  );
}
