import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { afterEach, describe, it } from "vitest";
import { loadLocalEnvFile } from "./env-file.js";

const TEMP_ROOTS: string[] = [];

afterEach(async () => {
  while (TEMP_ROOTS.length > 0) {
    const next = TEMP_ROOTS.pop();
    if (next) {
      await rm(next, { recursive: true, force: true });
    }
  }
});

describe("loadLocalEnvFile", () => {
  it("loads keys from .env without overriding existing shell environment", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "goatcitadel-env-test-"));
    TEMP_ROOTS.push(tempRoot);
    await mkdir(path.join(tempRoot, "config"), { recursive: true });
    await writeFile(path.join(tempRoot, "config", "assistant.config.json"), "{}\n", "utf8");
    await writeFile(
      path.join(tempRoot, ".env"),
      [
        "OPENAI_API_KEY=from-dotenv",
        "GLM_API_KEY=\"glm value\"",
        "MOONSHOT_API_KEY='moonshot value'",
        "",
      ].join("\n"),
      "utf8",
    );

    const priorRoot = process.env.GOATCITADEL_ROOT_DIR;
    const priorOpenai = process.env.OPENAI_API_KEY;
    const priorGlm = process.env.GLM_API_KEY;
    const priorMoonshot = process.env.MOONSHOT_API_KEY;

    try {
      process.env.GOATCITADEL_ROOT_DIR = tempRoot;
      process.env.OPENAI_API_KEY = "from-shell";
      delete process.env.GLM_API_KEY;
      delete process.env.MOONSHOT_API_KEY;

      const result = loadLocalEnvFile({ forceReload: true });
      assert.equal(result.path, path.join(tempRoot, ".env"));
      assert.equal(process.env.OPENAI_API_KEY, "from-shell");
      assert.equal(process.env.GLM_API_KEY, "glm value");
      assert.equal(process.env.MOONSHOT_API_KEY, "moonshot value");
    } finally {
      if (priorRoot === undefined) {
        delete process.env.GOATCITADEL_ROOT_DIR;
      } else {
        process.env.GOATCITADEL_ROOT_DIR = priorRoot;
      }

      if (priorOpenai === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = priorOpenai;
      }
      if (priorGlm === undefined) {
        delete process.env.GLM_API_KEY;
      } else {
        process.env.GLM_API_KEY = priorGlm;
      }
      if (priorMoonshot === undefined) {
        delete process.env.MOONSHOT_API_KEY;
      } else {
        process.env.MOONSHOT_API_KEY = priorMoonshot;
      }
    }
  });
});

