import { getChatModePreset } from "@goatcitadel/contracts";
import type { ModeOrchestrationPolicy } from "../types.js";

const preset = getChatModePreset("chat");

export const CHAT_MODE_POLICY: ModeOrchestrationPolicy = {
  mode: "chat",
  maxVisibleVisibility: "summarized",
  defaultVisibility: preset.defaultPrefs.orchestrationVisibility ?? "summarized",
  defaultIntensity: preset.defaultPrefs.orchestrationIntensity ?? "minimal",
  maxSteps: 3,
  maxParallelAgents: 1,
  allowHiddenOrchestration: true,
  allowParallelWorkers: false,
  defaultCodeAutoApply: preset.defaultPrefs.codeAutoApply ?? "manual",
};
