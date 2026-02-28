import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { ToolInvokeRequest, ToolPolicyConfig } from "@goatcitadel/contracts";
import { assertReadPathAllowed, assertWritePathInJail } from "./sandbox/path-jail.js";
import { assertHostAllowed } from "./sandbox/network-guard.js";

const execAsync = promisify(exec);
const MAX_HTTP_REDIRECTS = 5;

export async function executeTool(
  request: ToolInvokeRequest,
  config: ToolPolicyConfig,
): Promise<Record<string, unknown>> {
  switch (request.toolName) {
    case "session.status":
      return {
        sessionId: request.sessionId,
        status: "ok",
      };

    case "fs.read": {
      const targetPath = String(request.args.path ?? "");
      assertReadPathAllowed(targetPath, config.sandbox.writeJailRoots, config.sandbox.readOnlyRoots);
      const content = await fs.readFile(targetPath, "utf8");
      return {
        path: targetPath,
        bytes: content.length,
        content,
      };
    }

    case "fs.write": {
      const targetPath = String(request.args.path ?? "");
      const content = String(request.args.content ?? "");
      assertWritePathInJail(targetPath, config.sandbox.writeJailRoots);
      await fs.mkdir(path.dirname(path.resolve(targetPath)), { recursive: true });
      await fs.writeFile(targetPath, content, "utf8");
      return {
        path: targetPath,
        bytesWritten: content.length,
      };
    }

    case "http.get": {
      const url = String(request.args.url ?? "");
      assertHostAllowed(url, config.sandbox.networkAllowlist);
      const res = await fetchWithRedirectPolicy(url, config.sandbox.networkAllowlist);
      const text = await res.response.text();
      return {
        url: res.finalUrl,
        status: res.response.status,
        ok: res.response.ok,
        bodySnippet: text.slice(0, 4000),
      };
    }

    case "shell.exec": {
      const command = String(request.args.command ?? "");
      try {
        const { stdout, stderr } = await execAsync(command, {
          timeout: 20000,
          windowsHide: true,
          maxBuffer: 1024 * 1024,
        });
        return {
          command,
          stdout: stdout.slice(0, 8000),
          stderr: stderr.slice(0, 8000),
          exitCode: 0,
        };
      } catch (error) {
        const err = error as { stdout?: string; stderr?: string; code?: number | string; message: string };
        return {
          command,
          stdout: (err.stdout ?? "").slice(0, 8000),
          stderr: (err.stderr ?? err.message).slice(0, 8000),
          exitCode: typeof err.code === "number" ? err.code : -1,
        };
      }
    }

    default:
      return {
        simulated: true,
        toolName: request.toolName,
      };
  }
}

async function fetchWithRedirectPolicy(
  startUrl: string,
  allowlist: string[],
): Promise<{ response: Response; finalUrl: string }> {
  let currentUrl = startUrl;

  for (let hop = 0; hop <= MAX_HTTP_REDIRECTS; hop += 1) {
    assertHostAllowed(currentUrl, allowlist);
    const response = await fetch(currentUrl, {
      method: "GET",
      signal: AbortSignal.timeout(15000),
      redirect: "manual",
    });

    if (!isRedirect(response.status)) {
      return { response, finalUrl: currentUrl };
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new Error(`Redirect response missing location header for ${currentUrl}`);
    }

    currentUrl = new URL(location, currentUrl).toString();
  }

  throw new Error(`Too many redirects while requesting ${startUrl}`);
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}
