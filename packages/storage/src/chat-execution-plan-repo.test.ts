import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createDatabase } from "./sqlite.js";
import { ChatExecutionPlanRepository } from "./chat-execution-plan-repo.js";

const createdFiles: string[] = [];

afterEach(() => {
  for (const file of createdFiles.splice(0)) {
    try {
      fs.rmSync(file, { force: true });
      fs.rmSync(`${file}-wal`, { force: true });
      fs.rmSync(`${file}-shm`, { force: true });
    } catch {
      // ignore cleanup noise
    }
  }
});

function createRepo(): ChatExecutionPlanRepository {
  const dbPath = path.join(os.tmpdir(), `goatcitadel-chat-execution-plan-${randomUUID()}.db`);
  createdFiles.push(dbPath);
  const db = createDatabase({ dbPath });
  return new ChatExecutionPlanRepository(db);
}

describe("ChatExecutionPlanRepository", () => {
  it("creates, patches, and reloads execution plans with step linkage", () => {
    const repo = createRepo();

    const created = repo.create({
      sessionId: "sess-1",
      turnId: "turn-1",
      mode: "cowork",
      planningMode: "advisory",
      source: "planner",
      advisoryOnly: true,
      objective: "Investigate the regression",
      summary: "Plan the investigation and stop before execution.",
      steps: [
        {
          stepId: "step-1",
          index: 0,
          objective: "Review recent failures",
          successCriteria: "List the broken paths",
          suggestedTools: ["code.search", "file.read_range"],
          expectedOutput: "Failure inventory",
          parallelizable: false,
          status: "pending",
        },
        {
          stepId: "step-2",
          index: 1,
          objective: "Delegate verification",
          delegatedRole: "qa-validator",
          parallelizable: true,
          dependsOnStepIds: ["step-1"],
          status: "pending",
        },
      ],
    });

    assert.equal(created.objective, "Investigate the regression");
    assert.equal(created.steps.length, 2);
    assert.equal(created.steps[1]?.delegatedRole, "qa-validator");

    const patched = repo.patch(created.planId, {
      status: "running",
      summary: "Investigation is in progress.",
      startedAt: "2026-03-12T10:00:00.000Z",
      steps: [
        {
          ...created.steps[0]!,
          status: "completed",
          summary: "Found two broken retry paths.",
          finishedAt: "2026-03-12T10:01:00.000Z",
        },
        {
          ...created.steps[1]!,
          status: "running",
          childRunId: "delegation-run-1",
          childSessionId: "sess-child-1",
          childTurnId: "turn-child-1",
          startedAt: "2026-03-12T10:01:05.000Z",
        },
      ],
    });

    assert.equal(patched.status, "running");
    assert.equal(patched.summary, "Investigation is in progress.");
    assert.equal(patched.steps[0]?.status, "completed");
    assert.equal(patched.steps[1]?.childSessionId, "sess-child-1");

    const byTurn = repo.listByTurn("turn-1");
    assert.equal(byTurn.length, 1);
    assert.equal(byTurn[0]?.planId, created.planId);

    const bySession = repo.listBySession("sess-1");
    assert.equal(bySession.length, 1);
    assert.equal(bySession[0]?.steps[1]?.childRunId, "delegation-run-1");
  });
});
