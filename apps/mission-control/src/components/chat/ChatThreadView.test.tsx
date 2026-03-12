import { create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import type { ChatThreadResponse } from "@goatcitadel/contracts";
import { ChatThreadView } from "./ChatThreadView";

vi.mock("react-virtuoso", () => ({
  Virtuoso: (props: {
    data?: unknown[];
    itemContent?: (index: number, item: unknown) => React.ReactNode;
    components?: { Footer?: () => React.ReactNode };
  }) => (
    <div data-testid="virtuoso-mock">
      {(props.data ?? []).map((item, index) => (
        <div key={index}>{props.itemContent ? props.itemContent(index, item) : null}</div>
      ))}
      {props.components?.Footer ? <props.components.Footer /> : null}
    </div>
  ),
}));

function makeThread(): ChatThreadResponse {
  return {
    sessionId: "session-1",
    activeLeafTurnId: "turn-1",
    selectedTurnId: "turn-1",
    turns: [
      {
        turnId: "turn-1",
        branchKind: "append",
        userMessage: {
          messageId: "user-1",
          sessionId: "session-1",
          role: "user",
          actorType: "user",
          actorId: "operator",
          content: "Show me the plan.",
          timestamp: "2026-03-08T00:00:00.000Z",
        },
        assistantMessage: {
          messageId: "assistant-1",
          sessionId: "session-1",
          role: "assistant",
          actorType: "agent",
          actorId: "goatcitadel",
          content: "# Plan\n\n- First step\n- Second step\n\n`inline`\n\n```ts\nconst answer = 42;\n```\n\n[Docs](https://example.com)",
          timestamp: "2026-03-08T00:00:01.000Z",
        },
        trace: {
          turnId: "turn-1",
          sessionId: "session-1",
          userMessageId: "user-1",
          branchKind: "append",
          assistantMessageId: "assistant-1",
          status: "completed",
          mode: "chat",
          webMode: "auto",
          memoryMode: "auto",
          thinkingLevel: "standard",
          startedAt: "2026-03-08T00:00:00.000Z",
          finishedAt: "2026-03-08T00:00:02.000Z",
          toolRuns: [
            {
              toolRunId: "tool-1",
              turnId: "turn-1",
              sessionId: "session-1",
              toolName: "browser.navigate",
              status: "failed",
              startedAt: "2026-03-08T00:00:00.500Z",
              finishedAt: "2026-03-08T00:00:00.900Z",
              error: "remote site blocked automation (Cloudflare 403)",
              result: {
                url: "https://www.movieinsider.com/movies",
                finalUrl: "https://www.movieinsider.com/movies",
                status: 403,
                engineTier: "builtin",
                engineLabel: "Built-in browser",
                browserFailureClass: "remote_blocked",
                textSnippet: "Sorry, you have been blocked.",
              },
            },
          ],
          citations: [],
          routing: {
            liveDataIntent: true,
            fallbackReason: "primary blocked by remote site",
          },
          failure: {
            failureClass: "tool_blocked",
            message: "A required source blocked automated access.",
            retryable: true,
            recommendedAction: "retry_narrower",
          },
        },
        toolRuns: [
          {
            toolRunId: "tool-1",
            turnId: "turn-1",
            sessionId: "session-1",
            toolName: "browser.navigate",
            status: "failed",
            startedAt: "2026-03-08T00:00:00.500Z",
            finishedAt: "2026-03-08T00:00:00.900Z",
            error: "remote site blocked automation (Cloudflare 403)",
            result: {
              url: "https://www.movieinsider.com/movies",
              finalUrl: "https://www.movieinsider.com/movies",
              status: 403,
              engineTier: "builtin",
              engineLabel: "Built-in browser",
              browserFailureClass: "remote_blocked",
              textSnippet: "Sorry, you have been blocked.",
            },
          },
        ],
        citations: [],
        branch: {
          siblingTurnIds: ["turn-1"],
          activeSiblingIndex: 0,
          siblingCount: 1,
          isSelectedPath: true,
          newestLeafTurnId: "turn-1",
        },
      },
    ],
  };
}

describe("ChatThreadView", () => {
  it("renders assistant markdown as structured content", () => {
    const renderer = create(
      <ChatThreadView
        loading={false}
        notices={[]}
        followOutput={false}
        onBottomStateChange={() => {}}
        onEditTurn={() => {}}
        onRetryTurn={() => {}}
        onSelectTurn={() => {}}
        onSwitchBranch={() => {}}
        selectedTurnId="turn-1"
        thread={makeThread()}
      />,
    );

    expect(renderer.root.findByType("h1").children.join("")).toBe("Plan");
    expect(renderer.root.findByType("a").props.href).toBe("https://example.com");
    expect(renderer.root.findByType("pre")).toBeTruthy();
    expect(renderer.root.findAllByType("code").length).toBeGreaterThanOrEqual(2);
  });

  it("renders browser failure diagnostics in run details", () => {
    const renderer = create(
      <ChatThreadView
        loading={false}
        notices={[]}
        followOutput={false}
        onBottomStateChange={() => {}}
        onEditTurn={() => {}}
        onRetryTurn={() => {}}
        onSelectTurn={() => {}}
        onSwitchBranch={() => {}}
        selectedTurnId="turn-1"
        thread={makeThread()}
      />,
    );

    const detailsText = renderer.root.findAllByType("p")
      .map((node) => node.children.join(" "))
      .join("\n")
      .replace(/\s+/g, " ")
      .trim();
    expect(detailsText).toContain("Engine: Built-in browser (builtin)");
    expect(detailsText).toContain("URL: https://www.movieinsider.com/movies");
    expect(detailsText).toContain("HTTP status: 403");
    expect(detailsText).toContain("Fallback reason: primary blocked by remote site");
    expect(detailsText).toContain("Next step: Retry with a narrower request");
  });
});
