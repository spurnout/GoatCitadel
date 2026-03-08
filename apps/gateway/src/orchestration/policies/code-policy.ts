import type { ModeOrchestrationPolicy } from "../types.js";

export const CODE_MODE_POLICY: ModeOrchestrationPolicy = {
  mode: "code",
  maxVisibleVisibility: "explicit",
  defaultVisibility: "expandable",
  defaultIntensity: "balanced",
  maxSteps: 5,
  maxParallelAgents: 2,
  allowHiddenOrchestration: false,
  allowParallelWorkers: false,
  defaultCodeAutoApply: "aggressive_auto",
};
