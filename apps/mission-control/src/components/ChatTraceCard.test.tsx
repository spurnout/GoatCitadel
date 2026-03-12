import { create } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import type { ChatTurnTraceRecord } from "@goatcitadel/contracts";
import { ChatTraceCard } from "./ChatTraceCard";

function makeTrace(): ChatTurnTraceRecord {
  return {
    turnId: "turn-1",
    sessionId: "session-1",
    userMessageId: "user-1",
    assistantMessageId: "assistant-1",
    branchKind: "append",
    status: "completed",
    mode: "chat",
    model: "glm-5",
    webMode: "auto",
    memoryMode: "auto",
    thinkingLevel: "standard",
    startedAt: "2026-03-08T00:00:00.000Z",
    finishedAt: "2026-03-08T00:00:05.000Z",
    toolRuns: [
      {
        toolRunId: "tool-1",
        turnId: "turn-1",
        sessionId: "session-1",
        toolName: "browser.navigate",
        status: "failed",
        startedAt: "2026-03-08T00:00:01.000Z",
        finishedAt: "2026-03-08T00:00:02.000Z",
        error: "remote site blocked automation (Cloudflare 403)",
        result: {
          url: "https://www.movieinsider.com/movies",
          finalUrl: "https://www.movieinsider.com/movies",
          status: 403,
          engineTier: "builtin",
          engineLabel: "Built-in browser",
          browserFailureClass: "remote_blocked",
          fallbackChain: [
            {
              toolName: "browser.navigate",
              engineTier: "builtin",
              status: "failed",
            },
            {
              toolName: "browser.navigate",
              engineTier: "playwright_mcp",
              status: "failed",
            },
          ],
        },
      },
    ],
    citations: [],
    routing: {
      liveDataIntent: true,
      fallbackUsed: true,
      fallbackReason: "primary blocked by remote site",
      primaryProviderId: "glm",
      primaryModel: "glm-5",
      effectiveProviderId: "glm",
      effectiveModel: "glm-5",
    },
  };
}

describe("ChatTraceCard", () => {
  it("renders routing and browser diagnostics", () => {
    const renderer = create(<ChatTraceCard trace={makeTrace()} defaultCollapsed={false} />);
    const text = renderer.root.findAllByType("p")
      .map((node) => node.children.join(" "))
      .join("\n")
      .replace(/\s+/g, " ")
      .trim();

    expect(text).toContain("Fallback reason: primary blocked by remote site");
    expect(text).toContain("Engine: Built-in browser (builtin)");
    expect(text).toContain("URL: https://www.movieinsider.com/movies");
    expect(text).toContain("HTTP status: 403");
    expect(text).toContain("Browser failure: remote_blocked");
  });
});
