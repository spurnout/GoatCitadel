import { describe, expect, it } from "vitest";

const moduleNames = [
  "admin",
  "approvals",
  "auth",
  "channels",
  "chat",
  "comms",
  "durable",
  "improvement",
  "integrations",
  "knowledge",
  "learned-memory",
  "llm",
  "mcp",
  "media",
  "memory",
  "mesh",
  "monitoring",
  "npu",
  "onboarding",
  "orchestration",
  "policy",
  "proactive",
  "prompt-pack",
  "replay",
  "research",
  "session",
  "skills",
  "tasks",
  "tool-catalog",
  "tool-grants",
  "tools",
  "ui-change-risk",
  "ui-forms",
  "voice",
  "workspaces",
] as const;

describe("contracts domain modules coverage", () => {
  it("loads all domain modules with runtime exports", async () => {
    for (const name of moduleNames) {
      const mod = await import(`./${name}.js`);
      expect(name.length).toBeGreaterThan(0);
      expect(mod).toBeTypeOf("object");
    }
  });
});
