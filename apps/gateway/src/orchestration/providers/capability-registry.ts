import type { LlmRuntimeConfig } from "@goatcitadel/contracts";
import type { ProviderCapabilityRecord } from "../types.js";

const PROVIDER_BASELINES: Record<string, Omit<ProviderCapabilityRecord, "providerId" | "model">> = {
  openai: {
    qualityScore: 0.9,
    speedScore: 0.78,
    costScore: 0.58,
    reliabilityScore: 0.9,
    reasoningScore: 0.9,
    codingScore: 0.93,
    reviewScore: 0.9,
    synthesisScore: 0.88,
    researchScore: 0.74,
    jsonScore: 0.95,
    toolScore: 0.92,
    longContextScore: 0.78,
  },
  anthropic: {
    qualityScore: 0.93,
    speedScore: 0.62,
    costScore: 0.5,
    reliabilityScore: 0.88,
    reasoningScore: 0.95,
    codingScore: 0.84,
    reviewScore: 0.95,
    synthesisScore: 0.93,
    researchScore: 0.72,
    jsonScore: 0.8,
    toolScore: 0.86,
    longContextScore: 0.9,
  },
  glm: {
    qualityScore: 0.78,
    speedScore: 0.84,
    costScore: 0.9,
    reliabilityScore: 0.76,
    reasoningScore: 0.79,
    codingScore: 0.82,
    reviewScore: 0.76,
    synthesisScore: 0.78,
    researchScore: 0.68,
    jsonScore: 0.86,
    toolScore: 0.82,
    longContextScore: 0.74,
  },
  moonshot: {
    qualityScore: 0.84,
    speedScore: 0.74,
    costScore: 0.76,
    reliabilityScore: 0.78,
    reasoningScore: 0.84,
    codingScore: 0.88,
    reviewScore: 0.82,
    synthesisScore: 0.81,
    researchScore: 0.7,
    jsonScore: 0.75,
    toolScore: 0.8,
    longContextScore: 0.92,
  },
  perplexity: {
    qualityScore: 0.76,
    speedScore: 0.7,
    costScore: 0.62,
    reliabilityScore: 0.78,
    reasoningScore: 0.76,
    codingScore: 0.55,
    reviewScore: 0.64,
    synthesisScore: 0.72,
    researchScore: 0.97,
    jsonScore: 0.55,
    toolScore: 0.44,
    longContextScore: 0.7,
  },
  google: {
    qualityScore: 0.82,
    speedScore: 0.84,
    costScore: 0.72,
    reliabilityScore: 0.8,
    reasoningScore: 0.82,
    codingScore: 0.74,
    reviewScore: 0.75,
    synthesisScore: 0.8,
    researchScore: 0.76,
    jsonScore: 0.78,
    toolScore: 0.76,
    longContextScore: 0.82,
  },
};

const DEFAULT_BASELINE: Omit<ProviderCapabilityRecord, "providerId" | "model"> = PROVIDER_BASELINES.openai!;

export function buildProviderCapabilityRegistry(runtime: LlmRuntimeConfig): ProviderCapabilityRecord[] {
  return runtime.providers
    .filter((provider) => provider.hasApiKey)
    .map((provider) => {
      const baseline: Omit<ProviderCapabilityRecord, "providerId" | "model"> =
        PROVIDER_BASELINES[provider.providerId.toLowerCase()] ?? DEFAULT_BASELINE;
      const model = provider.defaultModel;
      const normalizedModel = model.toLowerCase();
      const record: ProviderCapabilityRecord = {
        ...baseline,
        providerId: provider.providerId,
        model,
      };
      return adjustForModel(record, normalizedModel);
    });
}

function adjustForModel(
  base: ProviderCapabilityRecord,
  normalizedModel: string,
): ProviderCapabilityRecord {
  const next = { ...base };
  if (normalizedModel.includes("mini") || normalizedModel.includes("flash")) {
    next.speedScore = clamp(next.speedScore + 0.12);
    next.costScore = clamp(next.costScore + 0.12);
    next.qualityScore = clamp(next.qualityScore - 0.08);
  }
  if (normalizedModel.includes("sonnet") || normalizedModel.includes("opus") || normalizedModel.includes("pro")) {
    next.reasoningScore = clamp(next.reasoningScore + 0.06);
    next.reviewScore = clamp(next.reviewScore + 0.06);
    next.qualityScore = clamp(next.qualityScore + 0.05);
    next.speedScore = clamp(next.speedScore - 0.04);
  }
  if (normalizedModel.includes("search") || normalizedModel.includes("sonar")) {
    next.researchScore = clamp(next.researchScore + 0.1);
  }
  if (normalizedModel.includes("code") || normalizedModel.includes("coder") || normalizedModel.includes("k2.5")) {
    next.codingScore = clamp(next.codingScore + 0.08);
  }
  if (normalizedModel.includes("reason") || normalizedModel.includes("thinking") || normalizedModel.includes("o1") || normalizedModel.includes("o3")) {
    next.reasoningScore = clamp(next.reasoningScore + 0.08);
  }
  if (normalizedModel.includes("32k") || normalizedModel.includes("128k") || normalizedModel.includes("long")) {
    next.longContextScore = clamp(next.longContextScore + 0.08);
  }
  return next;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
