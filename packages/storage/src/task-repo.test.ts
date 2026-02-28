import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createDatabase } from "./sqlite.js";
import { TaskRepository } from "./task-repo.js";
import { TaskActivityRepository } from "./task-activity-repo.js";
import { TaskDeliverableRepository } from "./task-deliverable-repo.js";
import { TaskSubagentRepository } from "./task-subagent-repo.js";

const createdFiles: string[] = [];

afterEach(() => {
  for (const file of createdFiles.splice(0)) {
    try {
      fs.rmSync(file, { force: true });
      fs.rmSync(`${file}-wal`, { force: true });
      fs.rmSync(`${file}-shm`, { force: true });
    } catch {
      // ignore
    }
  }
});

function createRepos() {
  const dbPath = path.join(os.tmpdir(), `personal-ai-task-${randomUUID()}.db`);
  createdFiles.push(dbPath);
  const db = createDatabase({ dbPath });
  return {
    tasks: new TaskRepository(db),
    activities: new TaskActivityRepository(db),
    deliverables: new TaskDeliverableRepository(db),
    subagents: new TaskSubagentRepository(db),
  };
}

describe("task repositories", () => {
  it("stores task workflow records", () => {
    const repos = createRepos();
    const task = repos.tasks.create({
      title: "Build event stream",
      priority: "high",
    });

    repos.activities.append(task.taskId, {
      activityType: "comment",
      message: "Started implementing SSE route",
      agentId: "agent-main",
    });
    repos.deliverables.append(task.taskId, {
      deliverableType: "file",
      title: "events.ts",
      path: "apps/gateway/src/routes/events.ts",
    });
    repos.subagents.create(task.taskId, {
      openclawSessionId: "agent:main:subagent:test",
      agentName: "sse-agent",
    });
    repos.subagents.updateByOpenclawSessionId("agent:main:subagent:test", {
      status: "completed",
    });

    const updated = repos.tasks.update(task.taskId, { status: "review" });
    const listed = repos.tasks.list({ limit: 20 });
    const statusCounts = repos.tasks.statusCounts();
    const activities = repos.activities.listByTask(task.taskId);
    const deliverables = repos.deliverables.listByTask(task.taskId);
    const subagents = repos.subagents.listByTask(task.taskId);

    assert.equal(updated.status, "review");
    assert.equal(listed.length, 1);
    assert.equal(statusCounts.find((entry) => entry.status === "review")?.count, 1);
    assert.equal(activities.length, 1);
    assert.equal(deliverables.length, 1);
    assert.equal(subagents[0]?.status, "completed");
    assert.equal(repos.subagents.activeCount(), 0);
  });
});
