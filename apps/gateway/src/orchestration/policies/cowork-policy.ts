import type { ModeOrchestrationPolicy } from "../types.js";

export const COWORK_MODE_POLICY: ModeOrchestrationPolicy = {
  mode: "cowork",
  maxVisibleVisibility: "explicit",
  defaultVisibility: "expandable",
  defaultIntensity: "balanced",
  maxSteps: 5,
  maxParallelAgents: 3,
  allowHiddenOrchestration: false,
  allowParallelWorkers: true,
  defaultCodeAutoApply: "manual",
};
