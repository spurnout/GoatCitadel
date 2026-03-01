import fs from "node:fs/promises";
import path from "node:path";
import type { ToolPolicyConfig } from "@goatcitadel/contracts";
import { assertHostAllowed } from "./sandbox/network-guard.js";
import { assertWritePathInJail } from "./sandbox/path-jail.js";

type BrowserToolName =
  | "browser.search"
  | "browser.navigate"
  | "browser.extract"
  | "browser.screenshot"
  | "browser.interact";

interface BrowserStepInput {
  action: "click" | "type" | "press" | "wait_for_selector" | "wait";
  selector?: string;
  text?: string;
  key?: string;
  timeoutMs?: number;
}

export function isBrowserToolName(name: string): name is BrowserToolName {
  return (
    name === "browser.search"
    || name === "browser.navigate"
    || name === "browser.extract"
    || name === "browser.screenshot"
    || name === "browser.interact"
  );
}

export async function executeBrowserTool(
  toolName: BrowserToolName,
  args: Record<string, unknown>,
  config: ToolPolicyConfig,
): Promise<Record<string, unknown>> {
  if (toolName === "browser.search") {
    return executeBrowserSearch(args, config);
  }
  if (toolName === "browser.navigate") {
    return executeBrowserNavigate(args, config);
  }
  if (toolName === "browser.extract") {
    return executeBrowserExtract(args, config);
  }
  if (toolName === "browser.screenshot") {
    return executeBrowserScreenshot(args, config);
  }
  return executeBrowserInteract(args, config);
}

async function executeBrowserSearch(
  args: Record<string, unknown>,
  config: ToolPolicyConfig,
): Promise<Record<string, unknown>> {
  const query = asNonEmptyString(args.query, "query");
  const engine = asString(args.engine)?.toLowerCase() ?? "duckduckgo";
  const limit = clampInteger(args.limit, 5, 1, 25);
  const searchUrl = buildSearchUrl(engine, query);

  const snapshot = await withBrowserPage(
    searchUrl,
    args,
    config,
    async (page) => {
      await page.waitForLoadState("domcontentloaded");
      const results = await page.evaluate((maxItems: number) => {
        const out: Array<{ title: string; url: string; snippet: string }> = [];
        const seen = new Set<string>();
        const anchors = Array.from(document.querySelectorAll("a[href]"));
        for (const anchor of anchors) {
          if (out.length >= maxItems) {
            break;
          }
          const href = anchor.getAttribute("href") ?? "";
          if (!href.startsWith("http://") && !href.startsWith("https://")) {
            continue;
          }
          if (seen.has(href)) {
            continue;
          }
          const title = (anchor.textContent ?? "").replace(/\s+/g, " ").trim();
          if (!title) {
            continue;
          }
          const containerText = (anchor.closest("article, li, div")?.textContent ?? "")
            .replace(/\s+/g, " ")
            .trim();
          out.push({
            title: title.slice(0, 240),
            url: href,
            snippet: containerText.slice(0, 420),
          });
          seen.add(href);
        }
        return out;
      }, limit);

      return {
        engine,
        query,
        results,
      };
    },
  );

  return {
    ...snapshot,
    action: "search",
  };
}

async function executeBrowserNavigate(
  args: Record<string, unknown>,
  config: ToolPolicyConfig,
): Promise<Record<string, unknown>> {
  const url = asNonEmptyString(args.url, "url");
  const maxChars = clampInteger(args.maxChars, 6000, 200, 20000);

  return withBrowserPage(url, args, config, async (page, responseStatus) => {
    const title = await page.title();
    const bodyText = await extractText(page, "body", maxChars);
    return {
      action: "navigate",
      title,
      status: responseStatus,
      textSnippet: bodyText,
    };
  });
}

async function executeBrowserExtract(
  args: Record<string, unknown>,
  config: ToolPolicyConfig,
): Promise<Record<string, unknown>> {
  const url = asNonEmptyString(args.url, "url");
  const selector = asString(args.selector) ?? "body";
  const maxChars = clampInteger(args.maxChars, 12000, 200, 50000);

  return withBrowserPage(url, args, config, async (page, responseStatus) => {
    const title = await page.title();
    const extracted = await extractText(page, selector, maxChars);
    return {
      action: "extract",
      title,
      selector,
      status: responseStatus,
      text: extracted,
    };
  });
}

async function executeBrowserScreenshot(
  args: Record<string, unknown>,
  config: ToolPolicyConfig,
): Promise<Record<string, unknown>> {
  const url = asNonEmptyString(args.url, "url");
  const outputPath = asString(args.outputPath)
    ?? asString(args.path)
    ?? `workspace/artifacts/browser-shot-${Date.now()}.png`;
  assertWritePathInJail(outputPath, config.sandbox.writeJailRoots);

  return withBrowserPage(url, args, config, async (page, responseStatus, finalUrl) => {
    const resolvedPath = path.resolve(outputPath);
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    const fullPage = asBoolean(args.fullPage, true);
    await page.screenshot({
      path: resolvedPath,
      fullPage,
    });
    const title = await page.title();
    return {
      action: "screenshot",
      title,
      status: responseStatus,
      finalUrl,
      outputPath: resolvedPath,
      fullPage,
    };
  });
}

async function executeBrowserInteract(
  args: Record<string, unknown>,
  config: ToolPolicyConfig,
): Promise<Record<string, unknown>> {
  const url = asNonEmptyString(args.url, "url");
  const rawSteps = Array.isArray(args.steps) ? args.steps : [];
  if (rawSteps.length === 0) {
    throw new Error("browser.interact requires a non-empty steps array");
  }

  const steps = rawSteps.map(parseStep);
  const finalSelector = asString(args.finalSelector) ?? "body";
  const maxChars = clampInteger(args.maxChars, 6000, 200, 30000);
  const outputPath = asString(args.outputPath) ?? asString(args.path);
  if (outputPath) {
    assertWritePathInJail(outputPath, config.sandbox.writeJailRoots);
  }

  return withBrowserPage(url, args, config, async (page, responseStatus, finalUrl) => {
    for (const step of steps) {
      const timeout = clampInteger(step.timeoutMs, 12000, 500, 60000);
      if (step.action === "click") {
        const selector = ensureSelector(step.selector, "click");
        await page.locator(selector).first().click({ timeout });
        continue;
      }
      if (step.action === "type") {
        const selector = ensureSelector(step.selector, "type");
        const text = asNonEmptyString(step.text, "type.text");
        await page.locator(selector).first().fill(text, { timeout });
        continue;
      }
      if (step.action === "press") {
        const key = asString(step.key) ?? "Enter";
        if (step.selector) {
          await page.locator(step.selector).first().press(key, { timeout });
        } else {
          await page.keyboard.press(key);
        }
        continue;
      }
      if (step.action === "wait_for_selector") {
        const selector = ensureSelector(step.selector, "wait_for_selector");
        await page.waitForSelector(selector, { timeout });
        continue;
      }
      if (step.action === "wait") {
        await page.waitForTimeout(clampInteger(step.timeoutMs, 1000, 100, 30000));
        continue;
      }
    }

    const title = await page.title();
    const text = await extractText(page, finalSelector, maxChars);
    let savedPath: string | undefined;
    if (outputPath) {
      const resolvedPath = path.resolve(outputPath);
      await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
      await page.screenshot({
        path: resolvedPath,
        fullPage: asBoolean(args.fullPage, true),
      });
      savedPath = resolvedPath;
    }

    return {
      action: "interact",
      title,
      status: responseStatus,
      finalUrl,
      finalSelector,
      textSnippet: text,
      screenshotPath: savedPath,
      stepsExecuted: steps.length,
    };
  });
}

async function withBrowserPage(
  url: string,
  args: Record<string, unknown>,
  config: ToolPolicyConfig,
  run: (
    page: PlaywrightPage,
    responseStatus: number | undefined,
    finalUrl: string,
  ) => Promise<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  assertAllowedHttpUrl(url);
  assertHostAllowed(url, config.sandbox.networkAllowlist);

  const playwright = await loadPlaywright();
  const headless = asBoolean(args.headless, true);
  const timeout = clampInteger(args.timeoutMs, 20000, 2000, 120000);
  const waitUntil = parseWaitUntil(args.waitUntil);
  const browser = await playwright.chromium.launch({ headless });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const response = await page.goto(url, {
      timeout,
      waitUntil,
    });

    const finalUrl = page.url();
    assertAllowedHttpUrl(finalUrl);
    assertHostAllowed(finalUrl, config.sandbox.networkAllowlist);

    const result = await run(page, response?.status(), finalUrl);
    return {
      url,
      finalUrl,
      ...result,
    };
  } finally {
    await browser.close();
  }
}

async function loadPlaywright(): Promise<PlaywrightModule> {
  const moduleName = "playwright";
  try {
    const loaded = await import(moduleName);
    return loaded as PlaywrightModule;
  } catch (error) {
    const reason = (error as Error).message;
    throw new Error(
      `Playwright runtime is unavailable: ${reason}. Install dependencies and run "pnpm exec playwright install chromium".`,
    );
  }
}

async function extractText(page: PlaywrightPage, selector: string, maxChars: number): Promise<string> {
  try {
    const text = await page.locator(selector).first().innerText({
      timeout: 5000,
    });
    return text.replace(/\s+/g, " ").trim().slice(0, maxChars);
  } catch {
    const text = await page.locator("body").first().innerText({ timeout: 5000 });
    return text.replace(/\s+/g, " ").trim().slice(0, maxChars);
  }
}

function parseStep(value: unknown): BrowserStepInput {
  if (!value || typeof value !== "object") {
    throw new Error("browser.interact step must be an object");
  }
  const step = value as Record<string, unknown>;
  const action = asString(step.action) as BrowserStepInput["action"] | undefined;
  if (!action || !["click", "type", "press", "wait_for_selector", "wait"].includes(action)) {
    throw new Error(`Unsupported browser.interact step action: ${String(step.action ?? "")}`);
  }
  return {
    action,
    selector: asString(step.selector),
    text: asString(step.text),
    key: asString(step.key),
    timeoutMs: typeof step.timeoutMs === "number" ? step.timeoutMs : undefined,
  };
}

function buildSearchUrl(engine: string, query: string): string {
  const encoded = encodeURIComponent(query);
  if (engine === "google") {
    return `https://www.google.com/search?q=${encoded}`;
  }
  if (engine === "bing") {
    return `https://www.bing.com/search?q=${encoded}`;
  }
  return `https://duckduckgo.com/?q=${encoded}`;
}

function parseWaitUntil(input: unknown): "load" | "domcontentloaded" | "networkidle" {
  const value = asString(input)?.toLowerCase();
  if (value === "load" || value === "networkidle" || value === "domcontentloaded") {
    return value;
  }
  return "domcontentloaded";
}

function ensureSelector(value: string | undefined, action: string): string {
  if (!value || !value.trim()) {
    throw new Error(`browser.interact ${action} step requires selector`);
  }
  return value;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function asNonEmptyString(value: unknown, field: string): string {
  const parsed = asString(value);
  if (!parsed) {
    throw new Error(`${field} is required`);
  }
  return parsed;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") {
      return true;
    }
    if (value.toLowerCase() === "false") {
      return false;
    }
  }
  return fallback;
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function assertAllowedHttpUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported URL protocol for browser tool: ${parsed.protocol}`);
  }
}

type PlaywrightModule = {
  chromium: {
    launch: (options: { headless: boolean }) => Promise<PlaywrightBrowser>;
  };
};

type PlaywrightBrowser = {
  newContext: () => Promise<PlaywrightContext>;
  close: () => Promise<void>;
};

type PlaywrightContext = {
  newPage: () => Promise<PlaywrightPage>;
};

type PlaywrightPage = {
  goto: (
    url: string,
    options: { timeout: number; waitUntil: "load" | "domcontentloaded" | "networkidle" },
  ) => Promise<{ status: () => number } | null>;
  waitForLoadState: (state: "domcontentloaded" | "load" | "networkidle") => Promise<void>;
  waitForSelector: (selector: string, options: { timeout: number }) => Promise<void>;
  waitForTimeout: (timeoutMs: number) => Promise<void>;
  title: () => Promise<string>;
  url: () => string;
  evaluate: <T>(fn: (maxItems: number) => T, maxItems: number) => Promise<T>;
  locator: (selector: string) => {
    first: () => {
      innerText: (options?: { timeout: number }) => Promise<string>;
      click: (options: { timeout: number }) => Promise<void>;
      fill: (text: string, options: { timeout: number }) => Promise<void>;
      press: (key: string, options: { timeout: number }) => Promise<void>;
    };
  };
  screenshot: (options: { path: string; fullPage: boolean }) => Promise<void>;
  keyboard: {
    press: (key: string) => Promise<void>;
  };
};
