import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AuthMode, LlmConfigFile, ToolPolicyConfig } from "@goatcitadel/contracts";
import { syncUnifiedConfig } from "./config-sync-lib.js";

export interface AssistantConfig {
  environment: string;
  defaultToolProfile: string;
  dataDir: string;
  transcriptsDir: string;
  auditDir: string;
  workspaceDir: string;
  worktreesDir: string;
  auth: AuthConfig;
  approvalExplainer: ApprovalExplainerConfig;
  memory: MemoryConfig;
  mesh: MeshConfig;
  npu: NpuConfig;
  budgets: {
    dailyUsdWarning: number;
    dailyUsdHardCap: number;
    sessionTokenHardCap: number;
  };
}

export interface MemoryConfig {
  enabled: boolean;
  qmd: {
    enabled: boolean;
    applyToChat: boolean;
    applyToOrchestration: boolean;
    minPromptChars: number;
    maxContextTokens: number;
    headroomTokens: number;
    maxTranscriptEvents: number;
    maxMemoryFiles: number;
    maxBytesPerFile: number;
    allowedExtensions: string[];
    cacheTtlSeconds: number;
    distiller: {
      providerId?: string;
      model?: string;
      timeoutMs: number;
      fallbackCheapModel: string;
    };
  };
}

export interface AuthConfig {
  mode: AuthMode;
  allowLoopbackBypass: boolean;
  token: {
    value?: string;
    queryParam: string;
  };
  basic: {
    username?: string;
    password?: string;
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

export interface MeshConfig {
  enabled: boolean;
  mode: "lan" | "wan" | "tailnet";
  nodeId: string;
  label?: string;
  advertiseAddress?: string;
  discovery: {
    mdns: boolean;
    staticPeers: string[];
  };
  security: {
    joinTokenEnv: string;
    requireMtls: boolean;
    tailnet: {
      enabled: boolean;
      expectedTailnet?: string;
    };
  };
  leases: {
    ttlSeconds: number;
  };
  replication: {
    batchSize: number;
  };
}

export interface NpuConfig {
  enabled: boolean;
  autoStart: boolean;
  sidecar: {
    baseUrl: string;
    command: string;
    args: string[];
    healthPath: string;
    modelsPath: string;
    startTimeoutMs: number;
    requestTimeoutMs: number;
    restartBudget: {
      windowMs: number;
      maxRestarts: number;
      backoffMs: number;
    };
  };
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
  const syncResult = await syncUnifiedConfig(rootDir, { createUnifiedIfMissing: true });
  if (syncResult.createdUnified || syncResult.syncedSections.length > 0) {
    const changes = [
      syncResult.createdUnified ? "created config/goatcitadel.json" : undefined,
      ...syncResult.syncedSections.map((name) => `synced ${name}`),
    ].filter(Boolean);
    console.info(`[goatcitadel:config] ${changes.join(", ")}`);
  }

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

  applyEnvironmentOverrides(assistant);

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

function applyEnvironmentOverrides(assistant: AssistantConfig): void {
  const mode = process.env.GOATCITADEL_AUTH_MODE;
  if (mode === "none" || mode === "token" || mode === "basic") {
    assistant.auth.mode = mode;
  }

  const token = process.env.GOATCITADEL_AUTH_TOKEN;
  if (token) {
    assistant.auth.token.value = token.trim();
  }

  const basicUsername = process.env.GOATCITADEL_AUTH_BASIC_USERNAME;
  if (basicUsername) {
    assistant.auth.basic.username = basicUsername.trim();
  }

  const basicPassword = process.env.GOATCITADEL_AUTH_BASIC_PASSWORD;
  if (basicPassword) {
    assistant.auth.basic.password = basicPassword;
  }

  const allowLoopbackBypass = process.env.GOATCITADEL_AUTH_ALLOW_LOOPBACK_BYPASS;
  if (allowLoopbackBypass) {
    assistant.auth.allowLoopbackBypass = allowLoopbackBypass === "1" || allowLoopbackBypass.toLowerCase() === "true";
  }

  const meshEnabled = process.env.GOATCITADEL_MESH_ENABLED;
  if (meshEnabled) {
    assistant.mesh.enabled = meshEnabled === "1" || meshEnabled.toLowerCase() === "true";
  }

  const meshMode = process.env.GOATCITADEL_MESH_MODE;
  if (meshMode === "lan" || meshMode === "wan" || meshMode === "tailnet") {
    assistant.mesh.mode = meshMode;
  }

  const meshNodeId = process.env.GOATCITADEL_MESH_NODE_ID;
  if (meshNodeId?.trim()) {
    assistant.mesh.nodeId = meshNodeId.trim();
  }

  const npuEnabled = process.env.GOATCITADEL_NPU_ENABLED;
  if (npuEnabled) {
    assistant.npu.enabled = npuEnabled === "1" || npuEnabled.toLowerCase() === "true";
  }

  const npuAutoStart = process.env.GOATCITADEL_NPU_AUTOSTART;
  if (npuAutoStart) {
    assistant.npu.autoStart = npuAutoStart === "1" || npuAutoStart.toLowerCase() === "true";
  }

  const npuBaseUrl = process.env.GOATCITADEL_NPU_SIDECAR_URL;
  if (npuBaseUrl?.trim()) {
    assistant.npu.sidecar.baseUrl = npuBaseUrl.trim();
  }

  const memoryEnabled = process.env.GOATCITADEL_MEMORY_ENABLED;
  if (memoryEnabled) {
    assistant.memory.enabled = memoryEnabled === "1" || memoryEnabled.toLowerCase() === "true";
  }

  const qmdEnabled = process.env.GOATCITADEL_MEMORY_QMD_ENABLED;
  if (qmdEnabled) {
    assistant.memory.qmd.enabled = qmdEnabled === "1" || qmdEnabled.toLowerCase() === "true";
  }
}

function withAssistantDefaults(input: Partial<AssistantConfig>): AssistantConfig {
  const approvalExplainerDefaults: ApprovalExplainerConfig = {
    enabled: true,
    mode: "async",
    minRiskLevel: "caution",
    timeoutMs: 15000,
    maxPayloadChars: 4000,
  };

  const authInput = (input.auth ?? {}) as Partial<AuthConfig>;
  const tokenInput = (authInput.token ?? {}) as Partial<AuthConfig["token"]>;
  const basicInput = (authInput.basic ?? {}) as Partial<AuthConfig["basic"]>;
  const meshInput = (input.mesh ?? {}) as Partial<MeshConfig>;
  const meshDiscovery = (meshInput.discovery ?? {}) as Partial<MeshConfig["discovery"]>;
  const meshSecurity = (meshInput.security ?? {}) as Partial<MeshConfig["security"]>;
  const meshTailnet = (meshSecurity.tailnet ?? {}) as Partial<MeshConfig["security"]["tailnet"]>;
  const meshLeases = (meshInput.leases ?? {}) as Partial<MeshConfig["leases"]>;
  const meshReplication = (meshInput.replication ?? {}) as Partial<MeshConfig["replication"]>;
  const npuInput = (input.npu ?? {}) as Partial<NpuConfig>;
  const npuSidecar = (npuInput.sidecar ?? {}) as Partial<NpuConfig["sidecar"]>;
  const npuRestart = (npuSidecar.restartBudget ?? {}) as Partial<NpuConfig["sidecar"]["restartBudget"]>;
  const memoryInput = (input.memory ?? {}) as Partial<MemoryConfig>;
  const qmdInput = (memoryInput.qmd ?? {}) as Partial<MemoryConfig["qmd"]>;
  const distillerInput = (qmdInput.distiller ?? {}) as Partial<MemoryConfig["qmd"]["distiller"]>;

  return {
    environment: input.environment ?? "local",
    defaultToolProfile: input.defaultToolProfile ?? "minimal",
    dataDir: input.dataDir ?? "./data",
    transcriptsDir: input.transcriptsDir ?? "./data/transcripts",
    auditDir: input.auditDir ?? "./data/audit",
    workspaceDir: input.workspaceDir ?? "./workspace",
    worktreesDir: input.worktreesDir ?? "./.worktrees",
    auth: {
      mode: authInput.mode ?? "none",
      allowLoopbackBypass: authInput.allowLoopbackBypass ?? false,
      token: {
        value: tokenInput.value,
        queryParam: tokenInput.queryParam ?? "access_token",
      },
      basic: {
        username: basicInput.username,
        password: basicInput.password,
      },
    },
    approvalExplainer: {
      ...approvalExplainerDefaults,
      ...(input.approvalExplainer ?? {}),
    },
    memory: {
      enabled: memoryInput.enabled ?? true,
      qmd: {
        enabled: qmdInput.enabled ?? true,
        applyToChat: qmdInput.applyToChat ?? true,
        applyToOrchestration: qmdInput.applyToOrchestration ?? true,
        minPromptChars: qmdInput.minPromptChars ?? 48,
        maxContextTokens: qmdInput.maxContextTokens ?? 1400,
        headroomTokens: qmdInput.headroomTokens ?? 600,
        maxTranscriptEvents: qmdInput.maxTranscriptEvents ?? 80,
        maxMemoryFiles: qmdInput.maxMemoryFiles ?? 36,
        maxBytesPerFile: qmdInput.maxBytesPerFile ?? 64_000,
        allowedExtensions: qmdInput.allowedExtensions ?? [
          ".md",
          ".txt",
          ".json",
          ".yaml",
          ".yml",
          ".log",
          ".ts",
          ".tsx",
          ".js",
          ".jsx",
        ],
        cacheTtlSeconds: qmdInput.cacheTtlSeconds ?? 300,
        distiller: {
          providerId: distillerInput.providerId,
          model: distillerInput.model,
          timeoutMs: distillerInput.timeoutMs ?? 12_000,
          fallbackCheapModel: distillerInput.fallbackCheapModel ?? "gpt-4.1-nano",
        },
      },
    },
    mesh: {
      enabled: meshInput.enabled ?? false,
      mode: meshInput.mode ?? "lan",
      nodeId: meshInput.nodeId ?? `${os.hostname().toLowerCase()}-${process.pid}`,
      label: meshInput.label,
      advertiseAddress: meshInput.advertiseAddress,
      discovery: {
        mdns: meshDiscovery.mdns ?? true,
        staticPeers: meshDiscovery.staticPeers ?? [],
      },
      security: {
        joinTokenEnv: meshSecurity.joinTokenEnv ?? "GOATCITADEL_MESH_JOIN_TOKEN",
        requireMtls: meshSecurity.requireMtls ?? true,
        tailnet: {
          enabled: meshTailnet.enabled ?? false,
          expectedTailnet: meshTailnet.expectedTailnet,
        },
      },
      leases: {
        ttlSeconds: meshLeases.ttlSeconds ?? 30,
      },
      replication: {
        batchSize: meshReplication.batchSize ?? 200,
      },
    },
    npu: {
      enabled: npuInput.enabled ?? false,
      autoStart: npuInput.autoStart ?? false,
      sidecar: {
        baseUrl: npuSidecar.baseUrl ?? "http://127.0.0.1:11440",
        command: npuSidecar.command ?? "python",
        args: npuSidecar.args ?? ["apps/npu-sidecar/server.py"],
        healthPath: npuSidecar.healthPath ?? "/health",
        modelsPath: npuSidecar.modelsPath ?? "/v1/models",
        startTimeoutMs: npuSidecar.startTimeoutMs ?? 20_000,
        requestTimeoutMs: npuSidecar.requestTimeoutMs ?? 12_000,
        restartBudget: {
          windowMs: npuRestart.windowMs ?? 60_000,
          maxRestarts: npuRestart.maxRestarts ?? 5,
          backoffMs: npuRestart.backoffMs ?? 2_000,
        },
      },
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
        defaultModel: "gpt-4.1-mini",
        apiKeyEnv: "OPENAI_API_KEY",
      },
      {
        providerId: "anthropic",
        label: "Anthropic (compatible endpoint)",
        baseUrl: "https://api.anthropic.com/v1",
        apiStyle: "openai-chat-completions",
        defaultModel: "claude-3-7-sonnet-latest",
        apiKeyEnv: "ANTHROPIC_API_KEY",
      },
      {
        providerId: "google",
        label: "Google (compatible endpoint)",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
        apiStyle: "openai-chat-completions",
        defaultModel: "gemini-2.0-flash",
        apiKeyEnv: "GOOGLE_API_KEY",
      },
      {
        providerId: "openrouter",
        label: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        apiStyle: "openai-chat-completions",
        defaultModel: "openai/gpt-4.1-mini",
        apiKeyEnv: "OPENROUTER_API_KEY",
      },
      {
        providerId: "mistral",
        label: "Mistral",
        baseUrl: "https://api.mistral.ai/v1",
        apiStyle: "openai-chat-completions",
        defaultModel: "mistral-small-latest",
        apiKeyEnv: "MISTRAL_API_KEY",
      },
      {
        providerId: "deepseek",
        label: "DeepSeek",
        baseUrl: "https://api.deepseek.com/v1",
        apiStyle: "openai-chat-completions",
        defaultModel: "deepseek-chat",
        apiKeyEnv: "DEEPSEEK_API_KEY",
      },
      {
        providerId: "glm",
        label: "GLM (compatible endpoint)",
        baseUrl: "https://api.z.ai/api/paas/v4",
        apiStyle: "openai-chat-completions",
        defaultModel: "glm-5",
        apiKeyEnv: "GLM_API_KEY",
      },
      {
        providerId: "moonshot",
        label: "Moonshot (Kimi API)",
        baseUrl: "https://api.moonshot.ai/v1",
        apiStyle: "openai-chat-completions",
        defaultModel: "kimi-k2.5",
        apiKeyEnv: "MOONSHOT_API_KEY",
      },
      {
        providerId: "perplexity",
        label: "Perplexity",
        baseUrl: "https://api.perplexity.ai/v1",
        apiStyle: "openai-chat-completions",
        defaultModel: "sonar",
        apiKeyEnv: "PERPLEXITY_API_KEY",
      },
      {
        providerId: "lmstudio",
        label: "LM Studio",
        baseUrl: "http://127.0.0.1:1234/v1",
        apiStyle: "openai-chat-completions",
        defaultModel: "local-model",
        apiKey: "lm-studio",
      },
      {
        providerId: "npu-local",
        label: "NPU Local Sidecar",
        baseUrl: "http://127.0.0.1:11440/v1",
        apiStyle: "openai-chat-completions",
        defaultModel: "phi-3.5-mini-instruct",
      },
    ],
  });
}
