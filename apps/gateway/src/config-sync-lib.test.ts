import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { syncUnifiedConfig } from "./config-sync-lib.js";

describe("syncUnifiedConfig", () => {
  it("creates config/goatcitadel.json from split files when missing", async () => {
    const root = await makeTempRoot();
    try {
      await seedSplitFiles(root);

      const result = await syncUnifiedConfig(root, { createUnifiedIfMissing: true });
      expect(result.createdUnified).toBe(true);

      const unifiedRaw = await readFile(path.join(root, "config", "goatcitadel.json"), "utf8");
      const unified = JSON.parse(unifiedRaw) as Record<string, unknown>;
      expect(unified.version).toBe(1);
      expect(unified.assistant).toBeDefined();
      expect(unified.toolPolicy).toBeDefined();
      expect(unified.budgets).toBeDefined();
      expect(unified.llm).toBeDefined();
      expect(unified.cronJobs).toBeDefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("syncs updated sections from config/goatcitadel.json into split files", async () => {
    const root = await makeTempRoot();
    try {
      await seedSplitFiles(root);
      const unifiedPath = path.join(root, "config", "goatcitadel.json");
      await writeFile(unifiedPath, JSON.stringify({
        version: 1,
        assistant: {
          environment: "local",
          defaultToolProfile: "coding",
        },
        budgets: {
          mode: "power",
          daily: {
            tokensWarning: 10,
            tokensHardCap: 20,
            usdWarning: 1,
            usdHardCap: 2,
          },
          session: {
            tokensHardCap: 30,
            turnMaxInputTokens: 40,
            turnMaxOutputTokens: 50,
          },
        },
      }, null, 2), "utf8");

      const result = await syncUnifiedConfig(root);
      expect(result.syncedSections).toContain("assistant.config.json");
      expect(result.syncedSections).toContain("budgets.json");

      const assistantRaw = await readFile(path.join(root, "config", "assistant.config.json"), "utf8");
      const assistant = JSON.parse(assistantRaw) as { defaultToolProfile?: string };
      expect(assistant.defaultToolProfile).toBe("coding");

      const budgetsRaw = await readFile(path.join(root, "config", "budgets.json"), "utf8");
      const budgets = JSON.parse(budgetsRaw) as { mode?: string };
      expect(budgets.mode).toBe("power");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function makeTempRoot(): Promise<string> {
  const root = path.join(os.tmpdir(), `goatcitadel-config-sync-${randomUUID()}`);
  await mkdir(path.join(root, "config"), { recursive: true });
  return root;
}

async function seedSplitFiles(root: string): Promise<void> {
  const configDir = path.join(root, "config");
  await writeFile(path.join(configDir, "assistant.config.json"), JSON.stringify({
    environment: "local",
    defaultToolProfile: "minimal",
  }, null, 2), "utf8");
  await writeFile(path.join(configDir, "tool-policy.json"), JSON.stringify({
    profiles: { minimal: ["session.status"] },
    tools: { profile: "minimal", allow: [], deny: [] },
    agents: {},
    sandbox: {
      writeJailRoots: ["./workspace"],
      readOnlyRoots: ["./config"],
      networkAllowlist: [],
      riskyShellPatterns: [],
      requireApprovalForRiskyShell: true,
    },
  }, null, 2), "utf8");
  await writeFile(path.join(configDir, "budgets.json"), JSON.stringify({
    mode: "balanced",
    daily: {
      tokensWarning: 100,
      tokensHardCap: 200,
      usdWarning: 1,
      usdHardCap: 2,
    },
    session: {
      tokensHardCap: 50,
      turnMaxInputTokens: 10,
      turnMaxOutputTokens: 20,
    },
  }, null, 2), "utf8");
  await writeFile(path.join(configDir, "llm-providers.json"), JSON.stringify({
    activeProviderId: "local",
    providers: [
      {
        providerId: "local",
        label: "Local",
        baseUrl: "http://127.0.0.1:1234/v1",
        apiStyle: "openai-chat-completions",
        defaultModel: "local-model",
      },
    ],
  }, null, 2), "utf8");
  await writeFile(path.join(configDir, "cron-jobs.json"), JSON.stringify({
    jobs: [],
  }, null, 2), "utf8");
}
