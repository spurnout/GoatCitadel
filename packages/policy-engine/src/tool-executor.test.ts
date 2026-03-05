import { describe, expect, it, beforeEach, vi } from "vitest";
import type { ToolInvokeRequest, ToolPolicyConfig } from "@goatcitadel/contracts";
import type { Storage } from "@goatcitadel/storage";

const mocked = vi.hoisted(() => ({
  isBrowserToolName: vi.fn<(name: string) => boolean>(),
  executeBrowserTool: vi.fn<
    (toolName: string, args: Record<string, unknown>, config: ToolPolicyConfig) => Promise<Record<string, unknown>>
  >(),
}));

vi.mock("./browser-tools.js", () => ({
  isBrowserToolName: mocked.isBrowserToolName,
  executeBrowserTool: mocked.executeBrowserTool,
}));

import { executeTool } from "./tool-executor.js";

const storageStub = {} as Storage;

const policyConfig: ToolPolicyConfig = {
  profiles: {
    minimal: ["session.status"],
  },
  tools: {
    profile: "minimal",
    allow: [],
    deny: [],
  },
  agents: {},
  sandbox: {
    writeJailRoots: ["./workspace"],
    readOnlyRoots: ["./skills"],
    networkAllowlist: ["localhost"],
    riskyShellPatterns: [],
    requireApprovalForRiskyShell: true,
  },
};

describe("executeTool", () => {
  beforeEach(() => {
    mocked.isBrowserToolName.mockReset();
    mocked.executeBrowserTool.mockReset();
  });

  it("dispatches browser tools to browser executor", async () => {
    mocked.isBrowserToolName.mockReturnValue(true);
    mocked.executeBrowserTool.mockResolvedValue({
      action: "navigate",
      title: "Example",
    });

    const request: ToolInvokeRequest = {
      toolName: "browser.navigate",
      args: { url: "https://example.com" },
      agentId: "researcher",
      sessionId: "sess-1",
    };

    const result = await executeTool(request, policyConfig, storageStub);

    expect(mocked.executeBrowserTool).toHaveBeenCalledWith(
      "browser.navigate",
      request.args,
      policyConfig,
    );
    expect(result).toMatchObject({ action: "navigate", title: "Example" });
  });

  it("returns simulated output for unknown non-browser tools", async () => {
    mocked.isBrowserToolName.mockReturnValue(false);

    const request: ToolInvokeRequest = {
      toolName: "custom.unknown",
      args: {},
      agentId: "agent",
      sessionId: "sess-2",
    };

    const result = await executeTool(request, policyConfig, storageStub);

    expect(result).toEqual({
      simulated: true,
      toolName: "custom.unknown",
    });
  });

  it("executes shell commands via execFile parsing", async () => {
    mocked.isBrowserToolName.mockReturnValue(false);
    const request: ToolInvokeRequest = {
      toolName: "shell.exec",
      args: { command: 'node -e "process.stdout.write(\'ok\')"' },
      agentId: "agent",
      sessionId: "sess-3",
    };

    const result = await executeTool(request, policyConfig, storageStub);
    expect(result).toMatchObject({
      command: request.args.command,
      executable: "node",
      exitCode: 0,
    });
    expect(String(result.stdout ?? "")).toContain("ok");
  });

  it("rejects malformed shell command parsing", async () => {
    mocked.isBrowserToolName.mockReturnValue(false);
    const request: ToolInvokeRequest = {
      toolName: "shell.exec",
      args: { command: "echo \"unterminated" },
      agentId: "agent",
      sessionId: "sess-4",
    };

    await expect(executeTool(request, policyConfig, storageStub)).rejects.toThrow(
      "unmatched quotes or escape sequence",
    );
  });

  it("blocks risky shell command without approval context", async () => {
    mocked.isBrowserToolName.mockReturnValue(false);
    const riskyPolicy: ToolPolicyConfig = {
      ...policyConfig,
      sandbox: {
        ...policyConfig.sandbox,
        riskyShellPatterns: ["rm -rf"],
        requireApprovalForRiskyShell: true,
      },
    };
    const request: ToolInvokeRequest = {
      toolName: "shell.exec",
      args: { command: "rm -rf ./tmp" },
      agentId: "agent",
      sessionId: "sess-5",
    };

    await expect(executeTool(request, riskyPolicy, storageStub)).rejects.toThrow(
      "Risky shell command requires approval",
    );
  });

  it("allows risky shell command when approval context is provided", async () => {
    mocked.isBrowserToolName.mockReturnValue(false);
    const riskyPolicy: ToolPolicyConfig = {
      ...policyConfig,
      sandbox: {
        ...policyConfig.sandbox,
        riskyShellPatterns: ["node --version"],
        requireApprovalForRiskyShell: true,
      },
    };
    const request: ToolInvokeRequest = {
      toolName: "shell.exec",
      args: { command: "node --version" },
      agentId: "agent",
      sessionId: "sess-6",
      consentContext: {
        source: "ui",
        reason: "approval:apr_123",
      },
    };

    const result = await executeTool(request, riskyPolicy, storageStub);
    expect(result).toMatchObject({
      command: "node --version",
    });
  });

  it("blocks bankr tools when built-in support is disabled", async () => {
    mocked.isBrowserToolName.mockReturnValue(false);
    const request: ToolInvokeRequest = {
      toolName: "bankr.status",
      args: {},
      agentId: "agent",
      sessionId: "sess-7",
    };

    await expect(executeTool(request, policyConfig, storageStub, {
      bankrBuiltinEnabled: false,
    })).rejects.toThrow("Bankr built-in is disabled.");
  });
});
