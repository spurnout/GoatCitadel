import type { ModeOrchestrationPolicy } from "../types.js";

export const CHAT_MODE_POLICY: ModeOrchestrationPolicy = {
  mode: "chat",
  maxVisibleVisibility: "summarized",
  defaultVisibility: "hidden",
  defaultIntensity: "minimal",
  maxSteps: 3,
  maxParallelAgents: 1,
  allowHiddenOrchestration: true,
  allowParallelWorkers: false,
  defaultCodeAutoApply: "manual",
};
