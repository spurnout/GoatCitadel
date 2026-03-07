import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
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

let playwrightChromiumInstallPromise: Promise<void> | null = null;

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
  const requestedEngine = normalizeSearchEngine(asString(args.engine)) ?? "auto";
  const limit = clampInteger(args.limit ?? args.maxResults, 5, 1, 25);
  const attemptedEngines: string[] = [];
  const failures: string[] = [];
  let lastEmptySnapshot: Record<string, unknown> | undefined;

  for (const engine of resolveSearchEngineCandidates(requestedEngine)) {
    attemptedEngines.push(engine);
    const searchUrl = buildSearchUrl(engine, query);
    try {
      const snapshot = await withBrowserPage(
        searchUrl,
        args,
        config,
        async (page) => {
          await page.waitForLoadState("domcontentloaded");
          await page.waitForTimeout(400);
          const rawResults = await page.evaluate((maxItems: number) => {
            const out: Array<{ href: string; title: string; snippet: string }> = [];
            const seen = new Set<string>();
            const anchors = Array.from(document.querySelectorAll("a[href]"));
            for (const anchor of anchors) {
              if (out.length >= maxItems) {
                break;
              }
              const href = anchor.getAttribute("href") ?? "";
              if (!href || href.startsWith("#") || href.toLowerCase().startsWith("javascript:")) {
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
                href: href.slice(0, 1200),
                title: title.slice(0, 240),
                snippet: containerText.slice(0, 420),
              });
              seen.add(href);
            }
            return out;
          }, Math.max(limit * 12, 40));
          const finalUrl = page.url();
          const results = normalizeBrowserSearchResults(rawResults, finalUrl, limit);

          return {
            requestedEngine,
            engine,
            query,
            results,
          };
        },
      );

      if ((snapshot.results as Array<unknown> | undefined)?.length) {
        return {
          ...snapshot,
          action: "search",
          attemptedEngines,
          fallbackUsed: false,
        };
      }

      lastEmptySnapshot = {
        ...snapshot,
        action: "search",
        attemptedEngines: [...attemptedEngines],
        fallbackUsed: false,
      };
      failures.push(`${engine}: no usable results from browser page`);
    } catch (playwrightError) {
      failures.push(`${engine}: ${(playwrightError as Error).message}`);
    }

    try {
      const fallback = await executeBrowserSearchFallback(query, limit, config, engine);
      if (fallback.results.length > 0) {
        return {
          ...fallback,
          action: "search",
          requestedEngine,
          engine,
          query,
          attemptedEngines,
          fallbackUsed: true,
          fallbackReason: failures.at(-1),
        };
      }
      lastEmptySnapshot = {
        ...fallback,
        action: "search",
        requestedEngine,
        engine,
        query,
        attemptedEngines: [...attemptedEngines],
        fallbackUsed: true,
        fallbackReason: failures.at(-1),
      };
      failures.push(`${engine}: fallback returned no usable results`);
    } catch (fallbackError) {
      failures.push(`${engine}: ${(fallbackError as Error).message}`);
    }
  }

  if (lastEmptySnapshot) {
    return {
      ...lastEmptySnapshot,
      warning: "Search engines returned no usable results",
      searchFailures: failures,
    };
  }

  throw new Error(`browser.search failed: ${failures.join(" | ")}`);
}

async function executeBrowserNavigate(
  args: Record<string, unknown>,
  config: ToolPolicyConfig,
): Promise<Record<string, unknown>> {
  const url = asNonEmptyString(args.url, "url");
  const maxChars = clampInteger(args.maxChars, 6000, 200, 20000);
  try {
    return await withBrowserPage(url, args, config, async (page, responseStatus) => {
      const title = await page.title();
      const domWeather = await extractWeatherSnapshot(page, title);
      let visualTextSnippet: string | undefined;
      const visualWeather = domWeather
        ? undefined
        : await extractWeatherSnapshotFromVisualTree(page, title, maxChars);
      if (visualWeather) {
        visualTextSnippet = visualWeather.visualTextSnippet;
      }
      const weather = domWeather ?? visualWeather?.weather;
      const bodyText = await extractText(page, "body", maxChars);
      const textSnippet = weather
        ? `${weather.summary}\n\n${bodyText}`.slice(0, maxChars)
        : bodyText;
      return {
        action: "navigate",
        title,
        status: responseStatus,
        textSnippet,
        weather,
        extractionMode: domWeather ? "dom" : visualWeather ? "visual" : "text",
        visualTextSnippet,
        fallbackUsed: false,
      };
    });
  } catch (playwrightError) {
    const fallback = await executeBrowserNavigateFallback(url, maxChars, config);
    return {
      ...fallback,
      action: "navigate",
      fallbackUsed: true,
      fallbackReason: (playwrightError as Error).message,
    };
  }
}

async function executeBrowserExtract(
  args: Record<string, unknown>,
  config: ToolPolicyConfig,
): Promise<Record<string, unknown>> {
  const url = asNonEmptyString(args.url, "url");
  const selector = asString(args.selector) ?? "body";
  const maxChars = clampInteger(args.maxChars, 12000, 200, 50000);
  try {
    return await withBrowserPage(url, args, config, async (page, responseStatus) => {
      const title = await page.title();
      const domWeather = await extractWeatherSnapshot(page, title);
      let visualTextSnippet: string | undefined;
      const visualWeather = domWeather
        ? undefined
        : await extractWeatherSnapshotFromVisualTree(page, title, maxChars);
      if (visualWeather) {
        visualTextSnippet = visualWeather.visualTextSnippet;
      }
      const weather = domWeather ?? visualWeather?.weather;
      const extracted = await extractText(page, selector, maxChars);
      const text = weather && selector === "body"
        ? `${weather.summary}\n\n${extracted}`.slice(0, maxChars)
        : extracted;
      return {
        action: "extract",
        title,
        selector,
        status: responseStatus,
        text,
        weather,
        extractionMode: domWeather ? "dom" : visualWeather ? "visual" : "text",
        visualTextSnippet,
        fallbackUsed: false,
      };
    });
  } catch (playwrightError) {
    const fallback = await executeBrowserExtractFallback(url, selector, maxChars, config);
    return {
      ...fallback,
      action: "extract",
      fallbackUsed: true,
      fallbackReason: (playwrightError as Error).message,
    };
  }
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
  const browser = await launchPlaywrightChromium(playwright, headless);

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
      `Playwright runtime is unavailable: ${reason}. Install dependencies and run "pnpm --filter @goatcitadel/policy-engine exec playwright install chromium".`,
    );
  }
}

async function launchPlaywrightChromium(
  playwright: PlaywrightModule,
  headless: boolean,
): Promise<PlaywrightBrowser> {
  try {
    return await playwright.chromium.launch({ headless });
  } catch (error) {
    if (!isMissingPlaywrightBrowserError(error)) {
      throw error;
    }
    await ensurePlaywrightChromiumInstalled();
    return playwright.chromium.launch({ headless });
  }
}

function isMissingPlaywrightBrowserError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /browsertype\.launch: executable doesn't exist/i.test(message);
}

async function ensurePlaywrightChromiumInstalled(): Promise<void> {
  if (!playwrightChromiumInstallPromise) {
    playwrightChromiumInstallPromise = (async () => {
      const appDir = resolvePlaywrightInstallDir();
      const pnpmCommand = resolvePnpmCommand();
      const result = spawnSync(
        pnpmCommand,
        ["--filter", "@goatcitadel/policy-engine", "exec", "playwright", "install", "chromium"],
        {
          cwd: appDir,
          stdio: "inherit",
          env: process.env,
        },
      );
      if (result.error) {
        throw result.error;
      }
      if (result.status !== 0) {
        throw new Error(`Failed to install Playwright Chromium runtime (exit code ${result.status ?? "unknown"})`);
      }
    })().finally(() => {
      playwrightChromiumInstallPromise = null;
    });
  }
  return playwrightChromiumInstallPromise;
}

function resolvePlaywrightInstallDir(): string {
  const fromEnv = process.env.GOATCITADEL_APP_DIR?.trim();
  if (fromEnv) {
    return path.resolve(fromEnv);
  }
  return process.cwd();
}

function resolvePnpmCommand(): string {
  const candidates = process.platform === "win32"
    ? ["pnpm.cmd", "pnpm", "pnpm.exe"]
    : ["pnpm"];
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (!result.error && result.status === 0) {
      return candidate;
    }
  }
  throw new Error("pnpm is not available to install Playwright Chromium runtime");
}

async function extractText(page: PlaywrightPage, selector: string, maxChars: number): Promise<string> {
  await page.waitForTimeout(750);
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

interface WeatherSnapshot {
  summary: string;
  location?: string;
  condition?: string;
  temperature?: string;
}

async function extractWeatherSnapshot(
  page: PlaywrightPage,
  title: string,
): Promise<WeatherSnapshot | undefined> {
  await page.waitForTimeout(900);
  const rawTemperature = await readFirstLocatorText(page, [
    "[data-testid='TemperatureValue']",
    "[data-testid='TemperatureValue'] span",
    "[class*='CurrentConditions--tempValue']",
    "[class*='CurrentConditions--tempValue'] span",
    "[class*='CurrentConditions--primary-temp']",
    "span[data-testid*='Temperature']",
  ]);
  const rawCondition = await readFirstLocatorText(page, [
    "[data-testid='wxPhrase']",
    "[data-testid='wxPhrase'] span",
    "[class*='CurrentConditions--phraseValue']",
    "[class*='CurrentConditions--phraseValue'] span",
    "[class*='CurrentConditions--condition']",
  ]);
  const rawLocation = await readFirstLocatorText(page, [
    "[data-testid='PresentationName']",
    "[data-testid='LocationPageTitle']",
    "[class*='CurrentConditions--location']",
    "h1[data-testid*='LocationPageTitle']",
    "h1",
  ]);
  const body = await extractText(page, "body", 3500);

  const temperature = normalizeTemperature(rawTemperature)
    ?? normalizeTemperature(title)
    ?? normalizeTemperature(body);
  const condition = normalizeCondition(rawCondition)
    ?? normalizeCondition(title)
    ?? normalizeCondition(body);
  const location = normalizeLocation(rawLocation)
    ?? extractLocationFromTitle(title)
    ?? normalizeLocation(title);

  if (!temperature && !condition) {
    return undefined;
  }

  const parts = [location, temperature, condition].filter(Boolean).join(" | ");
  return {
    summary: `Current weather snapshot: ${parts}.`,
    location: location ?? undefined,
    condition: condition ?? undefined,
    temperature: temperature ?? undefined,
  };
}

async function extractWeatherSnapshotFromVisualTree(
  page: PlaywrightPage,
  title: string,
  maxChars: number,
): Promise<{ weather: WeatherSnapshot; visualTextSnippet: string } | undefined> {
  const visualText = await extractVisualTextFromAccessibilityTree(page, Math.max(800, maxChars));
  if (!visualText) {
    return undefined;
  }

  const temperature = normalizeTemperature(visualText) ?? normalizeTemperature(title);
  const condition = normalizeCondition(visualText) ?? normalizeCondition(title);
  const location = extractLocationFromTitle(title) ?? normalizeLocation(visualText) ?? normalizeLocation(title);

  if (!temperature && !condition) {
    return undefined;
  }

  const parts = [location, temperature, condition].filter(Boolean).join(" | ");
  return {
    weather: {
      summary: `Visual weather snapshot: ${parts}.`,
      location: location ?? undefined,
      condition: condition ?? undefined,
      temperature: temperature ?? undefined,
    },
    visualTextSnippet: visualText.slice(0, 900),
  };
}

async function extractVisualTextFromAccessibilityTree(
  page: PlaywrightPage,
  maxChars: number,
): Promise<string | undefined> {
  if (!page.accessibility?.snapshot) {
    return undefined;
  }

  try {
    const root = await page.accessibility.snapshot({ interestingOnly: false });
    if (!root) {
      return undefined;
    }
    const chunks: string[] = [];
    collectAccessibilityText(root, chunks);
    const merged = chunks
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    return merged ? merged.slice(0, maxChars) : undefined;
  } catch {
    return undefined;
  }
}

function collectAccessibilityText(node: AccessibilitySnapshotNode, output: string[]): void {
  if (typeof node.name === "string" && node.name.trim()) {
    output.push(node.name.trim());
  }
  if (typeof node.value === "string" && node.value.trim()) {
    output.push(node.value.trim());
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      collectAccessibilityText(child, output);
    }
  }
}

async function readFirstLocatorText(
  page: PlaywrightPage,
  selectors: string[],
): Promise<string | undefined> {
  for (const selector of selectors) {
    try {
      const value = await page.locator(selector).first().innerText({ timeout: 1200 });
      const normalized = value.replace(/\s+/g, " ").trim();
      if (normalized) {
        return normalized;
      }
    } catch {
      // Continue searching other selectors.
    }
  }
  return undefined;
}

function normalizeTemperature(input: string | undefined): string | undefined {
  const value = (input ?? "").replace(/\s+/g, " ").trim();
  if (!value) {
    return undefined;
  }

  const direct = value.match(/(-?\d{1,3})\s*°\s*([FC])?/i);
  if (direct) {
    const unit = direct[2] ? direct[2].toUpperCase() : "";
    return `${direct[1]}°${unit}`;
  }

  const fahrenheitWord = value.match(/(-?\d{1,3})\s*(degrees?|deg)\s*fahrenheit/i);
  if (fahrenheitWord) {
    return `${fahrenheitWord[1]}°F`;
  }
  const celsiusWord = value.match(/(-?\d{1,3})\s*(degrees?|deg)\s*celsius/i);
  if (celsiusWord) {
    return `${celsiusWord[1]}°C`;
  }

  const jsonLike = value.match(/(?:temp(?:erature)?|currentTemp|feelsLike)[^0-9-]{0,12}(-?\d{1,3})/i);
  if (jsonLike) {
    return `${jsonLike[1]}°`;
  }

  return undefined;
}

function normalizeCondition(input: string | undefined): string | undefined {
  const value = (input ?? "").replace(/\s+/g, " ").trim();
  if (!value) {
    return undefined;
  }

  const phrase = value.match(
    /\b(sunny|mostly sunny|partly cloudy|cloudy|overcast|rain|rainy|showers|snow|snowy|fog|mist|haze|clear|windy|thunderstorms?)\b/i,
  );
  if (!phrase) {
    return undefined;
  }
  return phrase[0]
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizeLocation(input: string | undefined): string | undefined {
  const value = (input ?? "").replace(/\s+/g, " ").trim();
  if (!value) {
    return undefined;
  }

  const cleaned = value
    .replace(/\b(weather|forecast|today|hourly|current conditions)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length < 3) {
    return undefined;
  }
  if (/^-?\d{1,3}\s*°[FC]?$/i.test(cleaned) || cleaned.includes("°")) {
    return undefined;
  }
  if (/^\d+$/.test(cleaned)) {
    return undefined;
  }
  return cleaned.slice(0, 80);
}

function extractLocationFromTitle(title: string): string | undefined {
  const value = title.replace(/\s+/g, " ").trim();
  if (!value) {
    return undefined;
  }

  const weatherFor = value.match(/\bfor\s+(.+?)\s*(?:\||$)/i);
  if (weatherFor?.[1]) {
    return normalizeLocation(weatherFor[1]);
  }

  const dashSplit = value.split("|")[0]?.trim();
  return normalizeLocation(dashSplit);
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
  return `https://lite.duckduckgo.com/lite/?q=${encoded}`;
}

function normalizeSearchEngine(engine: string | undefined): "auto" | "duckduckgo" | "bing" | "google" | undefined {
  if (!engine) {
    return undefined;
  }
  if (engine === "auto" || engine === "duckduckgo" || engine === "bing" || engine === "google") {
    return engine;
  }
  return undefined;
}

function resolveSearchEngineCandidates(engine: "auto" | "duckduckgo" | "bing" | "google"): Array<"duckduckgo" | "bing" | "google"> {
  if (engine === "google") {
    return ["google", "bing", "duckduckgo"];
  }
  if (engine === "bing") {
    return ["bing", "duckduckgo", "google"];
  }
  if (engine === "duckduckgo") {
    return ["duckduckgo", "bing", "google"];
  }
  return ["duckduckgo", "bing", "google"];
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

async function executeBrowserSearchFallback(
  query: string,
  limit: number,
  config: ToolPolicyConfig,
  engine: string,
): Promise<{
  finalUrl: string;
  results: Array<{ title: string; url: string; snippet: string }>;
}> {
  const url = buildSearchUrl(engine, query);
  const page = await fetchTextAllowlisted(url, config.sandbox.networkAllowlist);
  return {
    finalUrl: page.finalUrl,
    results: parseSearchResults(page.html, limit, page.finalUrl),
  };
}

async function executeBrowserNavigateFallback(
  url: string,
  maxChars: number,
  config: ToolPolicyConfig,
): Promise<Record<string, unknown>> {
  const page = await fetchTextAllowlisted(url, config.sandbox.networkAllowlist);
  const title = extractHtmlTitle(page.html) ?? page.finalUrl;
  const textSnippet = extractHtmlText(page.html, maxChars);
  return {
    url,
    finalUrl: page.finalUrl,
    title,
    status: 200,
    textSnippet,
    extractionMode: "html-fetch",
  };
}

async function executeBrowserExtractFallback(
  url: string,
  selector: string,
  maxChars: number,
  config: ToolPolicyConfig,
): Promise<Record<string, unknown>> {
  const page = await fetchTextAllowlisted(url, config.sandbox.networkAllowlist);
  const title = extractHtmlTitle(page.html) ?? page.finalUrl;
  const text = extractHtmlText(page.html, maxChars);
  return {
    url,
    finalUrl: page.finalUrl,
    title,
    selector,
    status: 200,
    text,
    extractionMode: selector === "body" ? "html-fetch" : "html-fetch-body-fallback",
  };
}

async function fetchTextAllowlisted(
  url: string,
  allowlist: string[],
): Promise<{ html: string; finalUrl: string }> {
  assertAllowedHttpUrl(url);
  assertHostAllowed(url, allowlist);

  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
    headers: {
      "User-Agent": "GoatCitadel/1.1.1 (+https://localhost)",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  const finalUrl = response.url || url;
  assertAllowedHttpUrl(finalUrl);
  assertHostAllowed(finalUrl, allowlist);

  if (!response.ok) {
    throw new Error(`Search fetch failed (${response.status})`);
  }

  return {
    html: await response.text(),
    finalUrl,
  };
}

function parseSearchResults(
  html: string,
  limit: number,
  baseUrl: string,
): Array<{ title: string; url: string; snippet: string }> {
  const out: Array<{ title: string; url: string; snippet: string }> = [];
  const seen = new Set<string>();
  const anchorPattern = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;
  while ((match = anchorPattern.exec(html)) !== null && out.length < limit) {
    const rawHref = decodeHtmlEntities(match[1] ?? "").trim();
    const resolvedUrl = normalizeSearchResultUrl(rawHref, baseUrl);
    if (!resolvedUrl || seen.has(resolvedUrl)) {
      continue;
    }

    const title = stripHtml(decodeHtmlEntities(match[2] ?? "")).replace(/\s+/g, " ").trim();
    if (!title) {
      continue;
    }

    const snippet = extractSnippetNear(html, match.index, 420);
    out.push({
      title: title.slice(0, 240),
      url: resolvedUrl,
      snippet,
    });
    seen.add(resolvedUrl);
  }

  return out;
}

function normalizeBrowserSearchResults(
  rawResults: Array<{ href: string; title: string; snippet: string }>,
  baseUrl: string,
  limit: number,
): Array<{ title: string; url: string; snippet: string }> {
  const out: Array<{ title: string; url: string; snippet: string }> = [];
  const seen = new Set<string>();
  for (const raw of rawResults) {
    const resolvedUrl = normalizeSearchResultUrl(raw.href, baseUrl);
    if (!resolvedUrl || seen.has(resolvedUrl)) {
      continue;
    }
    const title = raw.title.replace(/\s+/g, " ").trim();
    if (!title) {
      continue;
    }
    out.push({
      title: title.slice(0, 240),
      url: resolvedUrl,
      snippet: raw.snippet.replace(/\s+/g, " ").trim().slice(0, 420),
    });
    seen.add(resolvedUrl);
    if (out.length >= limit) {
      break;
    }
  }
  return out;
}

function normalizeSearchResultUrl(href: string, baseUrl: string): string | undefined {
  if (!href) {
    return undefined;
  }
  let parsed: URL;
  try {
    parsed = new URL(href, baseUrl);
  } catch {
    return undefined;
  }
  const host = parsed.hostname.toLowerCase();

  if (host === "duckduckgo.com" || host === "www.duckduckgo.com" || host === "lite.duckduckgo.com") {
    const target = parsed.searchParams.get("uddg");
    return normalizeExternalResultTarget(target);
  }

  if (host === "www.google.com" || host === "google.com") {
    if (parsed.pathname === "/url") {
      return normalizeExternalResultTarget(parsed.searchParams.get("q") ?? parsed.searchParams.get("url"));
    }
    if (parsed.pathname.startsWith("/search") || parsed.pathname.startsWith("/httpservice/")) {
      return undefined;
    }
  }

  if (host === "www.bing.com" || host === "bing.com") {
    if (parsed.pathname.startsWith("/ck/")) {
      return normalizeExternalResultTarget(decodeBingRedirectUrl(parsed.searchParams.get("u")));
    }
    if (parsed.pathname === "/" || parsed.pathname.startsWith("/search")) {
      return undefined;
    }
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return undefined;
  }
  return parsed.toString();
}

function normalizeExternalResultTarget(target: string | null | undefined): string | undefined {
  if (!target) {
    return undefined;
  }
  try {
    const decoded = decodeURIComponent(target);
    if (!decoded.startsWith("http://") && !decoded.startsWith("https://")) {
      return undefined;
    }
    return decoded;
  } catch {
    return undefined;
  }
}

function decodeBingRedirectUrl(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const raw = value.startsWith("a1") ? value.slice(2) : value;
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8").trim();
    if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
      return decoded;
    }
  } catch {
    return undefined;
  }
  return normalizeExternalResultTarget(value);
}

function extractSnippetNear(html: string, index: number, maxChars: number): string {
  const window = html.slice(Math.max(0, index), Math.min(html.length, index + 900));
  const stripped = stripHtml(decodeHtmlEntities(window)).replace(/\s+/g, " ").trim();
  return stripped.slice(0, maxChars);
}

function extractHtmlTitle(html: string): string | undefined {
  const matched = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const raw = matched?.[1];
  if (!raw) {
    return undefined;
  }
  const title = stripHtml(decodeHtmlEntities(raw)).replace(/\s+/g, " ").trim();
  return title || undefined;
}

function extractHtmlText(html: string, maxChars: number): string {
  const withoutNoise = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ");
  return stripHtml(decodeHtmlEntities(withoutNoise)).replace(/\s+/g, " ").trim().slice(0, maxChars);
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]+>/g, " ");
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#(\d+);/g, (_, code: string) => {
      const numeric = Number(code);
      return Number.isFinite(numeric) ? String.fromCharCode(numeric) : "";
    });
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
  evaluate: <T, Arg>(fn: (arg: Arg) => T, arg: Arg) => Promise<T>;
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
  accessibility?: {
    snapshot: (options?: { interestingOnly?: boolean }) => Promise<AccessibilitySnapshotNode | null>;
  };
};

interface AccessibilitySnapshotNode {
  name?: string;
  value?: string;
  children?: AccessibilitySnapshotNode[];
}
