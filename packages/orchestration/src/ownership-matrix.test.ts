import { describe, expect, it } from "vitest";
import type { OrchestrationWave } from "@goatcitadel/contracts";
import { findOwnershipConflicts } from "./ownership-matrix.js";

describe("findOwnershipConflicts", () => {
  it("finds overlaps in a wave", () => {
    const wave: OrchestrationWave = {
      waveId: "wave-1",
      verify: [],
      budgetUsd: 10,
      ownership: [
        { agentId: "a", paths: ["apps/web/**"] },
        { agentId: "b", paths: ["apps/web/components/**"] },
      ],
      phases: [
        {
          phaseId: "p1",
          ownerAgentId: "a",
          specPath: "phases/p1.md",
          loopMode: "fresh-context",
          requiresApproval: false,
        },
      ],
    };

    const conflicts = findOwnershipConflicts(wave);
    expect(conflicts.length).toBeGreaterThan(0);
  });
});