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
});
