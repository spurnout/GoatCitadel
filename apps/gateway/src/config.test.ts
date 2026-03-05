import path from "node:path";
import os from "node:os";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { loadGatewayConfig } from "./config.js";

const TEMP_ROOTS: string[] = [];

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

afterEach(async () => {
  while (TEMP_ROOTS.length > 0) {
    const next = TEMP_ROOTS.pop();
    if (next) {
      await rm(next, { recursive: true, force: true });
    }
  }
});

describe("loadGatewayConfig", () => {
  it("defaults computer-use guardrails feature flag to true when omitted", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "goatcitadel-config-test-"));
    TEMP_ROOTS.push(rootDir);
    const configDir = path.join(rootDir, "config");
    await mkdir(configDir, { recursive: true });

    await writeJson(path.join(configDir, "assistant.config.json"), {
      auth: {
        mode: "none",
      },
      features: {
        durableKernelV1Enabled: false,
      },
    });

    await writeJson(path.join(configDir, "tool-policy.json"), {
      sandbox: {
        writeJailRoots: [],
        readOnlyRoots: [],
      },
    });

    await writeJson(path.join(configDir, "budgets.json"), {
      mode: "balanced",
      daily: {
        tokensWarning: 1000,
        tokensHardCap: 2000,
        usdWarning: 1,
        usdHardCap: 2,
      },
      session: {
        tokensHardCap: 1000,
        turnMaxInputTokens: 500,
        turnMaxOutputTokens: 500,
      },
    });

    await writeJson(path.join(configDir, "llm-providers.json"), {
      activeProviderId: "openai",
      providers: [],
    });

    await writeJson(path.join(configDir, "cron-jobs.json"), {
      jobs: [],
    });

    const config = await loadGatewayConfig(rootDir);
    expect(config.assistant.features.computerUseGuardrailsV1Enabled).toBe(true);
  });
});
