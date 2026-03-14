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
  return createRepoWithDb().repo;
}

function createRepoWithDb(): { repo: ChatExecutionPlanRepository; db: ReturnType<typeof createDatabase> } {
  const dbPath = path.join(os.tmpdir(), `goatcitadel-chat-execution-plan-${randomUUID()}.db`);
  createdFiles.push(dbPath);
  const db = createDatabase({ dbPath });
  return {
    repo: new ChatExecutionPlanRepository(db),
    db,
  };
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

  it("allows repeated logical step ids across different plans", () => {
    const repo = createRepo();

    const first = repo.create({
      sessionId: "sess-a",
      turnId: "turn-a",
      mode: "cowork",
      planningMode: "off",
      source: "workflow_template",
      objective: "Plan A",
      summary: "First plan",
      steps: [
        {
          stepId: "orch-step-1",
          index: 0,
          objective: "Research",
          parallelizable: false,
          status: "pending",
        },
        {
          stepId: "orch-step-2",
          index: 1,
          objective: "Synthesize",
          dependsOnStepIds: ["orch-step-1"],
          parallelizable: false,
          status: "pending",
        },
      ],
    });

    const second = repo.create({
      sessionId: "sess-b",
      turnId: "turn-b",
      mode: "cowork",
      planningMode: "off",
      source: "workflow_template",
      objective: "Plan B",
      summary: "Second plan",
      steps: [
        {
          stepId: "orch-step-1",
          index: 0,
          objective: "Research",
          parallelizable: false,
          status: "pending",
        },
        {
          stepId: "orch-step-2",
          index: 1,
          objective: "Critique",
          dependsOnStepIds: ["orch-step-1"],
          parallelizable: false,
          status: "pending",
        },
      ],
    });

    assert.deepEqual(first.steps.map((step) => step.stepId), ["orch-step-1", "orch-step-2"]);
    assert.deepEqual(second.steps.map((step) => step.stepId), ["orch-step-1", "orch-step-2"]);
    assert.deepEqual(second.steps[1]?.dependsOnStepIds, ["orch-step-1"]);
  });

  it("supports execution plan writes inside an outer transaction", () => {
    const { repo, db } = createRepoWithDb();

    db.exec("BEGIN IMMEDIATE");
    try {
      const created = repo.create({
        sessionId: "sess-nested",
        turnId: "turn-nested",
        mode: "cowork",
        planningMode: "off",
        source: "planner",
        objective: "Nested write",
        summary: "Create a plan inside an outer transaction.",
        steps: [
          {
            stepId: "step-1",
            index: 0,
            objective: "Write inside nested transaction",
            parallelizable: false,
            status: "pending",
          },
        ],
      });

      const patched = repo.patch(created.planId, {
        status: "running",
        summary: "Nested write succeeded.",
      });

      assert.equal(patched.status, "running");
      assert.equal(patched.steps[0]?.stepId, "step-1");
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  });

  it("reads old rows where step_id lacks the planId prefix", () => {
    const { repo, db } = createRepoWithDb();

    const planId = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO chat_execution_plans (
        plan_id, session_id, turn_id, mode, planning_mode, status, source, advisory_only,
        objective, summary, created_at, updated_at
      ) VALUES (?, 'sess-old', 'turn-old', 'cowork', 'off', 'drafted', 'workflow_template', 0,
        'Legacy plan', 'Legacy summary', ?, ?)
    `).run(planId, now, now);

    // Insert step with OLD format: step_id is just the logical id, no planId prefix
    db.prepare(`
      INSERT INTO chat_execution_plan_steps (
        plan_id, step_id, step_index, objective, parallelizable, status
      ) VALUES (?, 'orch-step-1', 0, 'Old step', 0, 'pending')
    `).run(planId);

    const loaded = repo.get(planId);
    assert.equal(loaded.steps.length, 1);
    // toLogicalExecutionPlanStepId should return the raw value when no prefix matches
    assert.equal(loaded.steps[0]?.stepId, "orch-step-1");
  });
});
