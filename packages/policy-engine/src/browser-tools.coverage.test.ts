import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolPolicyConfig } from "@goatcitadel/contracts";

const mocked = vi.hoisted(() => ({
  launch: vi.fn(),
}));

vi.mock("playwright", () => ({
  chromium: {
    launch: mocked.launch,
  },
}));

import { executeBrowserTool, isBrowserToolName } from "./browser-tools.js";

function createConfig(root: string): ToolPolicyConfig {
  return {
    profiles: {
      minimal: ["browser.*"],
    },
    tools: {
      profile: "minimal",
      allow: [],
      deny: [],
    },
    agents: {},
    sandbox: {
      writeJailRoots: [root],
      readOnlyRoots: [root],
      networkAllowlist: [
        "example.com",
        "duckduckgo.com",
        "lite.duckduckgo.com",
        "www.google.com",
        "www.bing.com",
      ],
      riskyShellPatterns: [],
      requireApprovalForRiskyShell: true,
    },
  };
}

function createPlaywrightStub() {
  let currentUrl = "https://example.com/start";
  const page = {
    goto: async (url: string) => {
      currentUrl = url;
      return { status: () => 200 };
    },
    waitForLoadState: async () => undefined,
    waitForSelector: async () => undefined,
    waitForTimeout: async () => undefined,
    title: async () => "Austin Weather | 72°F Sunny",
    url: () => currentUrl,
    evaluate: async (_fn: unknown, maxItems: number) => {
      const out = [];
      for (let i = 0; i < Number(maxItems); i += 1) {
        out.push({
          title: `Result ${i + 1}`,
          url: `https://example.com/${i + 1}`,
          snippet: `Snippet ${i + 1}`,
        });
      }
      return out;
    },
    locator: (_selector: string) => ({
      first: () => ({
        innerText: async () => "72°F Sunny in Austin",
        click: async () => undefined,
        fill: async () => undefined,
        press: async () => undefined,
      }),
    }),
    screenshot: async (options: { path: string }) => {
      await fs.writeFile(options.path, "png", "utf8");
    },
    keyboard: {
      press: async () => undefined,
    },
    accessibility: {
      snapshot: async () => ({
        name: "Austin 72°F sunny",
        children: [{ name: "Current conditions clear skies" }],
      }),
    },
  };
  const context = {
    newPage: async () => page,
  };
  const browser = {
    newContext: async () => context,
    close: async () => undefined,
  };
  return browser;
}

describe("browser tools coverage sweep", () => {
  const priorFetch = globalThis.fetch;
  let tempRoot = "";

  beforeEach(async () => {
    mocked.launch.mockReset();
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "browser-tools-coverage-"));
    mocked.launch.mockResolvedValue(createPlaywrightStub() as never);
    globalThis.fetch = vi.fn(async () => new Response(
      [
        '<a href="https://example.com/a">Result A</a>',
        '<a href="/l/?uddg=https%3A%2F%2Fexample.com%2Fb">Result B</a>',
      ].join("\n"),
      {
        status: 200,
        headers: { "content-type": "text/html" },
      },
    )) as unknown as typeof fetch;
  });

  afterEach(async () => {
    globalThis.fetch = priorFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("recognizes browser tool names", () => {
    expect(isBrowserToolName("browser.search")).toBe(true);
    expect(isBrowserToolName("browser.navigate")).toBe(true);
    expect(isBrowserToolName("browser.extract")).toBe(true);
    expect(isBrowserToolName("browser.screenshot")).toBe(true);
    expect(isBrowserToolName("browser.interact")).toBe(true);
    expect(isBrowserToolName("shell.exec")).toBe(false);
  });

  it("executes search/navigate/extract/screenshot/interact flows", async () => {
    const config = createConfig(tempRoot);

    const search = await executeBrowserTool(
      "browser.search",
      { query: "goatcitadel", engine: "duckduckgo", limit: 2 },
      config,
    );
    expect(search.action).toBe("search");
    expect(Array.isArray(search.results)).toBe(true);

    const nav = await executeBrowserTool(
      "browser.navigate",
      { url: "https://example.com/weather", maxChars: 900 },
      config,
    );
    expect(nav.action).toBe("navigate");
    expect(String(nav.textSnippet)).toContain("72");

    const extracted = await executeBrowserTool(
      "browser.extract",
      { url: "https://example.com/weather", selector: "body", maxChars: 1200 },
      config,
    );
    expect(extracted.action).toBe("extract");
    expect(String(extracted.text)).toContain("72");

    const screenshotPath = path.join(tempRoot, "shots", "coverage.png");
    const screenshot = await executeBrowserTool(
      "browser.screenshot",
      { url: "https://example.com/weather", outputPath: screenshotPath, fullPage: true },
      config,
    );
    expect(screenshot.action).toBe("screenshot");
    await expect(fs.access(screenshotPath)).resolves.toBeUndefined();

    const interactPath = path.join(tempRoot, "shots", "interact.png");
    const interact = await executeBrowserTool(
      "browser.interact",
      {
        url: "https://example.com/form",
        finalSelector: "body",
        outputPath: interactPath,
        steps: [
          { action: "click", selector: "#start" },
          { action: "type", selector: "#q", text: "coverage" },
          { action: "press", selector: "#q", key: "Enter" },
          { action: "wait_for_selector", selector: "#done" },
          { action: "wait", timeoutMs: 10 },
        ],
      },
      config,
    );
    expect(interact.action).toBe("interact");
    expect(interact.stepsExecuted).toBe(5);
    await expect(fs.access(interactPath)).resolves.toBeUndefined();
  });

  it("uses fallback parsing when playwright is unavailable for browser.search", async () => {
    const config = createConfig(tempRoot);
    mocked.launch.mockRejectedValueOnce(new Error("missing browser runtime"));

    const response = await executeBrowserTool(
      "browser.search",
      { query: "coverage", engine: "duckduckgo", limit: 3 },
      config,
    );
    expect(response.fallbackUsed).toBe(true);
    expect(Array.isArray(response.results)).toBe(true);
    expect((response.results as Array<unknown>).length).toBeGreaterThan(0);
  });

  it("rejects disallowed hosts and invalid interact steps", async () => {
    const config = createConfig(tempRoot);

    await expect(
      executeBrowserTool("browser.navigate", { url: "https://blocked.invalid" }, config),
    ).rejects.toThrow(/allowlist/i);

    await expect(
      executeBrowserTool(
        "browser.interact",
        {
          url: "https://example.com",
          steps: [{ action: "invalid" }],
        },
        config,
      ),
    ).rejects.toThrow(/Unsupported browser\.interact step action/i);
  });
});
