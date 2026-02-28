import { randomUUID } from "node:crypto";
import type { OrchestrationPlan, OrchestrationRun } from "@personal-ai/contracts";
import { validatePlan } from "./plan-schema.js";
import { findOwnershipConflicts } from "./ownership-matrix.js";

export interface RunLimitState {
  iterations: number;
  runtimeMinutes: number;
  costUsd: number;
}

export interface PhaseApprovalOptions {
  now?: string;
  costIncrementUsd?: number;
}

export class OrchestrationEngine {
  public validate(plan: OrchestrationPlan): void {
    validatePlan(plan);

    for (const wave of plan.waves) {
      const conflicts = findOwnershipConflicts(wave);
      if (conflicts.length > 0) {
        const first = conflicts[0];
        if (!first) {
          throw new Error(`Wave ${wave.waveId} has ownership conflicts`);
        }
        throw new Error(
          `Wave ${wave.waveId} ownership conflict: ${first.agentA}:${first.pathA} overlaps ${first.agentB}:${first.pathB}`,
        );
      }
    }
  }

  public createRun(plan: OrchestrationPlan): OrchestrationRun {
    this.validate(plan);
    return {
      runId: randomUUID(),
      planId: plan.planId,
      status: "queued",
      startedAt: new Date().toISOString(),
      totalCostUsd: 0,
      totalIterations: 0,
    };
  }

  public startRun(plan: OrchestrationPlan, run: OrchestrationRun): OrchestrationRun {
    const first = this.firstPhase(plan);
    if (!first) {
      return {
        ...run,
        status: "completed",
        endedAt: new Date().toISOString(),
      };
    }

    return {
      ...run,
      status: plan.mode === "hitl" ? "paused" : "running",
      currentWaveId: first.waveId,
      currentPhaseId: first.phaseId,
      endedAt: undefined,
    };
  }

  public approvePhase(
    plan: OrchestrationPlan,
    run: OrchestrationRun,
    approvedPhaseId: string,
    options: PhaseApprovalOptions = {},
  ): OrchestrationRun {
    if (run.status !== "paused" && run.status !== "running") {
      throw new Error(`Run ${run.runId} is not in an approvable state: ${run.status}`);
    }

    if (run.currentPhaseId !== approvedPhaseId) {
      throw new Error(
        `Run ${run.runId} expected phase ${run.currentPhaseId ?? "<none>"} but received approval for ${approvedPhaseId}`,
      );
    }

    const now = options.now ?? new Date().toISOString();
    const next = this.nextPhase(plan, approvedPhaseId);

    const candidate: OrchestrationRun = {
      ...run,
      totalIterations: run.totalIterations + 1,
      totalCostUsd: run.totalCostUsd + (options.costIncrementUsd ?? 0),
      currentWaveId: next?.waveId,
      currentPhaseId: next?.phaseId,
      status: next ? (plan.mode === "hitl" ? "paused" : "running") : "completed",
      endedAt: next ? undefined : now,
    };

    const runtimeMinutes = Math.max(
      0,
      (Date.parse(now) - Date.parse(run.startedAt)) / 60000,
    );

    if (
      this.shouldStopByLimits(plan, {
        iterations: candidate.totalIterations,
        runtimeMinutes,
        costUsd: candidate.totalCostUsd,
      })
    ) {
      return {
        ...candidate,
        status: "stopped_by_limit",
        endedAt: now,
      };
    }

    return candidate;
  }

  public shouldStopByLimits(plan: OrchestrationPlan, state: RunLimitState): boolean {
    return (
      state.iterations >= plan.maxIterations ||
      state.runtimeMinutes >= plan.maxRuntimeMinutes ||
      state.costUsd >= plan.maxCostUsd
    );
  }

  private firstPhase(
    plan: OrchestrationPlan,
  ): { waveId: string; phaseId: string } | undefined {
    const firstWave = plan.waves[0];
    const firstPhase = firstWave?.phases[0];
    if (!firstWave || !firstPhase) {
      return undefined;
    }

    return {
      waveId: firstWave.waveId,
      phaseId: firstPhase.phaseId,
    };
  }

  private nextPhase(
    plan: OrchestrationPlan,
    currentPhaseId: string,
  ): { waveId: string; phaseId: string } | undefined {
    for (let waveIndex = 0; waveIndex < plan.waves.length; waveIndex += 1) {
      const wave = plan.waves[waveIndex];
      if (!wave) {
        continue;
      }

      const phaseIndex = wave.phases.findIndex((phase) => phase.phaseId === currentPhaseId);
      if (phaseIndex === -1) {
        continue;
      }

      const nextInWave = wave.phases[phaseIndex + 1];
      if (nextInWave) {
        return {
          waveId: wave.waveId,
          phaseId: nextInWave.phaseId,
        };
      }

      const nextWave = plan.waves[waveIndex + 1];
      const firstInNextWave = nextWave?.phases[0];
      if (nextWave && firstInNextWave) {
        return {
          waveId: nextWave.waveId,
          phaseId: firstInNextWave.phaseId,
        };
      }

      return undefined;
    }

    throw new Error(`Phase ${currentPhaseId} not found in plan ${plan.planId}`);
  }
}