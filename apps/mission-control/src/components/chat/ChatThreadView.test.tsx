import { create } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import type { ChatThreadResponse } from "@goatcitadel/contracts";
import { ChatThreadView } from "./ChatThreadView";

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
          toolRuns: [],
          citations: [],
          routing: {},
        },
        toolRuns: [],
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
});
