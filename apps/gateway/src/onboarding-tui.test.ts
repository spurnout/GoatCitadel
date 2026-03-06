import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { isGoatCitadelAppDir, resolveGoatCitadelAppDir } from "./onboarding-tui-paths.js";

const tempDirs: string[] = [];

function createAppRoot(name: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  tempDirs.push(root);
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "goatcitadel" }));
  fs.writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
  fs.mkdirSync(path.join(root, "apps", "gateway"), { recursive: true });
  fs.writeFileSync(path.join(root, "apps", "gateway", "package.json"), JSON.stringify({ name: "@goatcitadel/gateway" }));
  return root;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("onboarding tui path helpers", () => {
  it("accepts a valid GoatCitadel app root", () => {
    const root = createAppRoot("goatcitadel-root");
    expect(isGoatCitadelAppDir(root)).toBe(true);
  });

  it("prefers GOATCITADEL_APP_DIR when it points at a valid app root", () => {
    const root = createAppRoot("goatcitadel-env");
    expect(resolveGoatCitadelAppDir({ envAppDir: root, cwd: os.tmpdir() })).toBe(root);
  });

  it("discovers the app root by walking upward from cwd", () => {
    const root = createAppRoot("goatcitadel-cwd");
    const nested = path.join(root, "apps", "gateway", "src");
    fs.mkdirSync(nested, { recursive: true });
    expect(resolveGoatCitadelAppDir({ cwd: nested, envAppDir: "" })).toBe(root);
  });

  it("falls back to the module path when cwd is unrelated", () => {
    const root = createAppRoot("goatcitadel-module");
    const moduleUrl = pathToFileURL(path.join(root, "apps", "gateway", "src", "onboarding-tui.ts")).href;
    expect(resolveGoatCitadelAppDir({ cwd: os.tmpdir(), envAppDir: "", moduleUrl })).toBe(root);
  });

  it("returns undefined when no valid app root can be found", () => {
    const strayDir = fs.mkdtempSync(path.join(os.tmpdir(), "goatcitadel-stray-"));
    tempDirs.push(strayDir);
    const moduleUrl = pathToFileURL(path.join(strayDir, "src", "onboarding-tui.ts")).href;
    expect(resolveGoatCitadelAppDir({ cwd: strayDir, envAppDir: "", moduleUrl })).toBeUndefined();
  });
});
