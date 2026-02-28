import { useEffect, useMemo, useState } from "react";
import {
  addTaskActivity,
  addTaskDeliverable,
  createTask,
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

const statuses: TaskRecord["status"][] = [
  "inbox",
  "assigned",
  "in_progress",
  "testing",
  "review",
  "done",
  "blocked",
];

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
  const [error, setError] = useState<string | null>(null);

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
    void Promise.all([
      fetchTaskActivities(taskId),
      fetchTaskDeliverables(taskId),
      fetchTaskSubagents(taskId),
    ])
      .then(([a, d, s]) => {
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
        openclawSessionId: subagentSessionId.trim(),
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

  return (
    <section>
      <h2>Tasks</h2>
      {error ? <p className="error">{error}</p> : null}

      <div className="controls-row">
        <input
          placeholder="New task title"
          value={createTitle}
          onChange={(event) => setCreateTitle(event.target.value)}
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
                <input
                  placeholder="Log an activity"
                  value={activityMessage}
                  onChange={(event) => setActivityMessage(event.target.value)}
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
                <input
                  placeholder="Deliverable title"
                  value={deliverableTitle}
                  onChange={(event) => setDeliverableTitle(event.target.value)}
                />
                <input
                  placeholder="Path (optional)"
                  value={deliverablePath}
                  onChange={(event) => setDeliverablePath(event.target.value)}
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

              <h4>Sub-Agent Sessions</h4>
              <div className="controls-row">
                <input
                  placeholder="OpenClaw session id"
                  value={subagentSessionId}
                  onChange={(event) => setSubagentSessionId(event.target.value)}
                />
                <input
                  placeholder="Agent name (optional)"
                  value={subagentName}
                  onChange={(event) => setSubagentName(event.target.value)}
                />
                <button onClick={onRegisterSubagent}>Register</button>
              </div>
              <ul className="compact-list">
                {subagents.map((session) => (
                  <li key={session.subagentSessionId}>
                    <strong>{session.agentName ?? session.openclawSessionId}</strong> - {session.status}
                    {session.status === "active" ? (
                      <button onClick={() => onCompleteSubagent(session.openclawSessionId)}>Mark complete</button>
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
