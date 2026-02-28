import fs from "node:fs/promises";
import path from "node:path";
import type { LlmConfigFile, ToolPolicyConfig } from "@personal-ai/contracts";

export interface AssistantConfig {
  environment: string;
  defaultToolProfile: string;
  dataDir: string;
  transcriptsDir: string;
  auditDir: string;
  workspaceDir: string;
  worktreesDir: string;
  approvalExplainer: ApprovalExplainerConfig;
  budgets: {
    dailyUsdWarning: number;
    dailyUsdHardCap: number;
    sessionTokenHardCap: number;
  };
}

export interface ApprovalExplainerConfig {
  enabled: boolean;
  mode: "async";
  minRiskLevel: "caution" | "danger" | "nuclear";
  providerId?: string;
  model?: string;
  timeoutMs: number;
  maxPayloadChars: number;
}

export interface BudgetConfig {
  mode: "saver" | "balanced" | "power";
  daily: {
    tokensWarning: number;
    tokensHardCap: number;
    usdWarning: number;
    usdHardCap: number;
  };
  session: {
    tokensHardCap: number;
    turnMaxInputTokens: number;
    turnMaxOutputTokens: number;
  };
}

export interface GatewayRuntimeConfig {
  assistant: AssistantConfig;
  toolPolicy: ToolPolicyConfig;
  budgets: BudgetConfig;
  llm: LlmConfigFile;
  rootDir: string;
  dbPath: string;
}

export async function loadGatewayConfig(rootDir: string): Promise<GatewayRuntimeConfig> {
  const configDir = path.join(rootDir, "config");
  const [assistantRaw, toolPolicyRaw, budgetsRaw, llmRaw] = await Promise.all([
    fs.readFile(path.join(configDir, "assistant.config.json"), "utf8"),
    fs.readFile(path.join(configDir, "tool-policy.json"), "utf8"),
    fs.readFile(path.join(configDir, "budgets.json"), "utf8"),
    readFileWithDefault(path.join(configDir, "llm-providers.json"), defaultLlmConfig()),
  ]);

  const assistant = withAssistantDefaults(JSON.parse(assistantRaw) as Partial<AssistantConfig>);
  const toolPolicy = JSON.parse(toolPolicyRaw) as ToolPolicyConfig;
  const budgets = JSON.parse(budgetsRaw) as BudgetConfig;
  const llm = JSON.parse(llmRaw) as LlmConfigFile;

  toolPolicy.sandbox.writeJailRoots = toolPolicy.sandbox.writeJailRoots.map((root) =>
    path.resolve(rootDir, root),
  );
  toolPolicy.sandbox.readOnlyRoots = toolPolicy.sandbox.readOnlyRoots.map((root) =>
    path.resolve(rootDir, root),
  );

  return {
    assistant,
    toolPolicy,
    budgets,
    llm,
    rootDir,
    dbPath: path.join(rootDir, "data", "index.db"),
  };
}

function withAssistantDefaults(input: Partial<AssistantConfig>): AssistantConfig {
  const approvalExplainerDefaults: ApprovalExplainerConfig = {
    enabled: true,
    mode: "async",
    minRiskLevel: "caution",
    timeoutMs: 15000,
    maxPayloadChars: 4000,
  };

  return {
    environment: input.environment ?? "local",
    defaultToolProfile: input.defaultToolProfile ?? "minimal",
    dataDir: input.dataDir ?? "./data",
    transcriptsDir: input.transcriptsDir ?? "./data/transcripts",
    auditDir: input.auditDir ?? "./data/audit",
    workspaceDir: input.workspaceDir ?? "./workspace",
    worktreesDir: input.worktreesDir ?? "./.worktrees",
    approvalExplainer: {
      ...approvalExplainerDefaults,
      ...(input.approvalExplainer ?? {}),
    },
    budgets: {
      dailyUsdWarning: input.budgets?.dailyUsdWarning ?? 10,
      dailyUsdHardCap: input.budgets?.dailyUsdHardCap ?? 50,
      sessionTokenHardCap: input.budgets?.sessionTokenHardCap ?? 120000,
    },
  };
}

async function readFileWithDefault(filePath: string, fallback: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

function defaultLlmConfig(): string {
  return JSON.stringify({
    activeProviderId: "openai",
    providers: [
      {
        providerId: "openai",
        label: "OpenAI",
        baseUrl: "https://api.openai.com/v1",
        apiStyle: "openai-chat-completions",
        defaultModel: "gpt-4o-mini",
        apiKeyEnv: "OPENAI_API_KEY",
      },
      {
        providerId: "lmstudio",
        label: "LM Studio",
        baseUrl: "http://127.0.0.1:1234/v1",
        apiStyle: "openai-chat-completions",
        defaultModel: "local-model",
        apiKey: "lm-studio",
      },
    ],
  });
}
