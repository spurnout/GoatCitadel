import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SkillImportService } from "./skill-import-service.js";

function createSystemSettingsRepo() {
  const store = new Map<string, unknown>();
  return {
    get<T>(key: string): { value: T } | undefined {
      if (!store.has(key)) {
        return undefined;
      }
      return { value: store.get(key) as T };
    },
    set(key: string, value: unknown) {
      store.set(key, value);
    },
  };
}

describe("SkillImportService lookup", () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "goat-skill-lookup-"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it("resolves SkillsMP listing URLs into review-only lookup results", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("skillsmp.com/skills/")) {
        return new Response(
          '<html><body><a href="https://github.com/example/notebooklm-skill">repo</a></body></html>',
          { status: 200 },
        );
      }
      throw new Error(`Unexpected fetch ${url}`);
    }));

    const service = new SkillImportService(rootDir, createSystemSettingsRepo() as never);
    const result = await service.lookupSources("https://skillsmp.com/skills/example-notebooklm-skill", 5);

    expect(result.parsedSource).toMatchObject({
      sourceProvider: "skillsmp",
      sourceKind: "marketplace_listing",
      installability: "review_only",
      upstreamUrl: "https://github.com/example/notebooklm-skill",
    });
    expect(result.bestMatch).toMatchObject({
      name: "Example Notebooklm Skill",
      matchReason: "Direct listing match",
      installability: "review_only",
      upstreamUrl: "https://github.com/example/notebooklm-skill",
    });
  });

  it("treats direct GitHub URLs as installable upstream sources", async () => {
    const service = new SkillImportService(rootDir, createSystemSettingsRepo() as never);
    const result = await service.lookupSources("https://github.com/example/playwright-skill", 5);

    expect(result.parsedSource).toMatchObject({
      sourceProvider: "github",
      sourceKind: "upstream_repo",
      installability: "direct",
    });
    expect(result.bestMatch).toMatchObject({
      sourceProvider: "github",
      installability: "direct",
      matchReason: "Direct source match",
    });
  });

  it("finds capability-style queries using deterministic ranking", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "https://skillsmp.com/") {
        return new Response(
          `
            <html>
              <body>
                <a href="/skills/playwright-interactive">Playwright</a>
                <a href="/skills/slides">Slides</a>
              </body>
            </html>
          `,
          { status: 200 },
        );
      }
      if (url === "https://agentskill.sh/") {
        return new Response(
          `
            <html>
              <body>
                <a href="/skills/doc-writer">Docs</a>
              </body>
            </html>
          `,
          { status: 200 },
        );
      }
      throw new Error(`Unexpected fetch ${url}`);
    }));

    const service = new SkillImportService(rootDir, createSystemSettingsRepo() as never);
    const result = await service.listSources("browser automation", 5);

    expect(result.items[0]).toMatchObject({
      name: "Playwright Interactive",
      matchReason: "Capability match",
    });
  });
});
