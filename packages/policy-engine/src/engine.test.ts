import { describe, expect, it, vi } from "vitest";
import type { ToolPolicyConfig } from "@goatcitadel/contracts";
import type { Storage } from "@goatcitadel/storage";
import { ToolPolicyEngine } from "./engine.js";

function createStorageStub(): Storage {
  return {
    toolAccessDecisions: {
      record: vi.fn(),
    },
    toolGrants: {
      list: vi.fn(() => []),
    },
  } as unknown as Storage;
}

const policyConfig: ToolPolicyConfig = {
  profiles: {
    danger: ["*"],
  },
  tools: {
    profile: "danger",
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

describe("ToolPolicyEngine bankr migration gating", () => {
  it("blocks bankr tools when built-in support is disabled", () => {
    const storage = createStorageStub();
    const engine = new ToolPolicyEngine(policyConfig, storage, undefined, {
      isBankrBuiltinEnabled: () => false,
    });
    const evaluation = engine.evaluateAccess({
      toolName: "bankr.write",
      args: {},
      agentId: "agent",
      sessionId: "session",
    });
    expect(evaluation.allowed).toBe(false);
    expect(evaluation.reasonCodes).toContain("bankr_builtin_disabled");
  });

  it("hides bankr tools from catalog when built-in support is disabled", () => {
    const storage = createStorageStub();
    const engine = new ToolPolicyEngine(policyConfig, storage, undefined, {
      isBankrBuiltinEnabled: () => false,
    });
    const catalog = engine.listCatalog();
    expect(catalog.some((tool) => tool.toolName.startsWith("bankr."))).toBe(false);
  });
});
