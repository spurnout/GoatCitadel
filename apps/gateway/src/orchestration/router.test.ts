import { describe, expect, it } from "vitest";
import type { ChatMessageRecord, ChatSessionPrefsRecord, LlmRuntimeConfig } from "@goatcitadel/contracts";
import { buildProviderCapabilityRegistry } from "./providers/capability-registry.js";
import {
  buildOrchestrationPlan,
  resolveModePolicy,
  shouldUseModeOrchestration,
} from "./router.js";
import type { OrchestrationRouterInput } from "./types.js";

const NOW = "2026-03-08T20:00:00.000Z";

function createPrefs(overrides: Partial<ChatSessionPrefsRecord> = {}): ChatSessionPrefsRecord {
  return {
    sessionId: "session-1",
    mode: "chat",
    planningMode: "off",
    providerId: undefined,
    model: undefined,
    webMode: "auto",
    memoryMode: "auto",
    thinkingLevel: "standard",
    toolAutonomy: "safe_auto",
    visionFallbackModel: undefined,
    orchestrationEnabled: true,
    orchestrationIntensity: "balanced",
    orchestrationVisibility: "explicit",
    orchestrationProviderPreference: "balanced",
    orchestrationReviewDepth: "standard",
    orchestrationParallelism: "auto",
    codeAutoApply: "aggressive_auto",
    proactiveMode: "off",
    autonomyBudget: undefined,
    retrievalMode: "standard",
    reflectionMode: "off",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createRuntime(): LlmRuntimeConfig {
  return {
    activeProviderId: "openai",
    activeModel: "gpt-4.1-mini",
    providers: [
      {
        providerId: "openai",
        label: "OpenAI",
        baseUrl: "https://api.openai.com/v1",
        apiStyle: "openai-chat-completions",
        defaultModel: "gpt-4.1-mini",
        hasApiKey: true,
        apiKeySource: "env",
      },
      {
        providerId: "anthropic",
        label: "Anthropic",
        baseUrl: "https://api.anthropic.com/v1",
        apiStyle: "openai-chat-completions",
        defaultModel: "claude-sonnet-4-6",
        hasApiKey: true,
        apiKeySource: "env",
      },
      {
        providerId: "perplexity",
        label: "Perplexity",
        baseUrl: "https://api.perplexity.ai",
        apiStyle: "openai-chat-completions",
        defaultModel: "sonar",
        hasApiKey: true,
        apiKeySource: "env",
      },
      {
        providerId: "moonshot",
        label: "Moonshot",
        baseUrl: "https://api.moonshot.ai/v1",
        apiStyle: "openai-chat-completions",
        defaultModel: "kimi-k2.5",
        hasApiKey: true,
        apiKeySource: "env",
      },
    ],
  };
}

function createInput(overrides: Partial<OrchestrationRouterInput["task"]> = {}): OrchestrationRouterInput {
  const runtime = createRuntime();
  const task = {
    sessionId: "session-1",
    workspaceId: "workspace-1",
    mode: "chat" as const,
    objective: "Help me answer this question simply.",
    prefs: createPrefs(),
    conversation: [] as ChatMessageRecord[],
    historyMessages: [],
    ...overrides,
  };
  return {
    task,
    runtime,
    capabilities: buildProviderCapabilityRegistry(runtime),
    policy: resolveModePolicy(task.mode),
  };
}

describe("orchestration router", () => {
  it("keeps simple chat requests on the single-agent path by default", () => {
    const input = createInput({
      mode: "chat",
      objective: "What is the capital of France?",
      prefs: createPrefs({
        mode: "chat",
        orchestrationIntensity: "balanced",
      }),
    });

    expect(shouldUseModeOrchestration(input)).toBe(false);
  });

  it("enables orchestration for research-heavy chat prompts", () => {
    const input = createInput({
      mode: "chat",
      objective: "Research the latest OpenClaw features, compare them, and critique tradeoffs.",
      prefs: createPrefs({
        mode: "chat",
        orchestrationIntensity: "balanced",
      }),
    });

    expect(shouldUseModeOrchestration(input)).toBe(true);
    const plan = buildOrchestrationPlan(input);
    expect(plan.workflowTemplate).toBe("chat.answer.review");
    expect(plan.routeDecision.visibility).toBe("summarized");
    expect(plan.steps.map((step) => step.role)).toEqual(["answerer", "reviewer", "synthesizer"]);
  });

  it("routes cowork research to parallel researchers with explicit visibility", () => {
    const input = createInput({
      mode: "cowork",
      objective: "Research the market, compare the strongest options, and synthesize a recommendation.",
      prefs: createPrefs({
        mode: "cowork",
        orchestrationVisibility: "explicit",
        orchestrationParallelism: "parallel",
      }),
    });
    input.policy = resolveModePolicy("cowork");

    expect(shouldUseModeOrchestration(input)).toBe(true);
    const plan = buildOrchestrationPlan(input);
    expect(plan.workflowTemplate).toBe("cowork.research.synthesize.critic");
    expect(plan.routeDecision.visibility).toBe("explicit");
    expect(plan.steps.filter((step) => step.role === "researcher")).toHaveLength(2);
    expect(plan.steps.filter((step) => step.role === "researcher").every((step) => step.stage === 1)).toBe(true);
  });

  it("pins the requested provider and code workflow when code mode is selected", () => {
    const input = createInput({
      mode: "code",
      objective: "Inspect the repository, plan the patch, implement it, review it, and validate edge cases.",
      prefs: createPrefs({
        mode: "code",
        providerId: "moonshot",
        model: "kimi-k2.5",
        orchestrationVisibility: "explicit",
      }),
    });
    input.policy = resolveModePolicy("code");

    const plan = buildOrchestrationPlan(input);
    expect(plan.workflowTemplate).toBe("code.plan.code.review.qa");
    expect(plan.steps.map((step) => step.role)).toEqual([
      "planner",
      "coder",
      "reviewer",
      "qa-validator",
      "synthesizer",
    ]);
    expect(plan.routeDecision.selectedProviders.every((selection) => selection.providerId === "moonshot")).toBe(true);
    expect(plan.routeDecision.selectedProviders.every((selection) => selection.model === "kimi-k2.5")).toBe(true);
  });
});
