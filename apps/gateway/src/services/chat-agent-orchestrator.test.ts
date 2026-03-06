import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { ChatCompletionResponse, ChatToolRunRecord, ChatTurnTraceRecord, ToolCatalogEntry, ToolInvokeResult } from "@goatcitadel/contracts";
import { ChatAgentOrchestrator } from "./chat-agent-orchestrator.js";

function createToolCatalog(toolNames: string[] = ["browser.search"]): ToolCatalogEntry[] {
  return toolNames.map((toolName) => {
    if (toolName === "browser.navigate") {
      return {
        toolName: "browser.navigate",
        category: "research",
        riskLevel: "safe",
        requiresApproval: false,
        description: "Navigate",
        argSchema: {
          type: "object",
          properties: {
            url: { type: "string" },
          },
          required: ["url"],
        },
        examples: [],
        pack: "core",
      };
    }
    return {
      toolName: "browser.search",
      category: "research",
      riskLevel: "safe",
      requiresApproval: false,
      description: "Search",
      argSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
      },
      examples: [],
      pack: "core",
    };
  });
}

function toolCallCompletion(query: string): ChatCompletionResponse {
  return {
    model: "glm-5",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call-1",
              type: "function",
              function: {
                name: "browser_search",
                arguments: JSON.stringify({ query }),
              },
            },
          ],
        },
      },
    ],
  };
}

function navigateToolCallCompletion(args: Record<string, unknown>): ChatCompletionResponse {
  return {
    model: "glm-5",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call-nav-1",
              type: "function",
              function: {
                name: "browser_navigate",
                arguments: JSON.stringify(args),
              },
            },
          ],
        },
      },
    ],
  };
}

function createMockStorage(): unknown {
  const traces = new Map<string, ChatTurnTraceRecord>();
  const toolRuns = new Map<string, ChatToolRunRecord>();
  return {
    chatTurnTraces: {
      create(input: Omit<ChatTurnTraceRecord, "toolRuns" | "citations">): ChatTurnTraceRecord {
        const record: ChatTurnTraceRecord = {
          ...input,
          toolRuns: [],
          citations: [],
        };
        traces.set(record.turnId, record);
        return record;
      },
      patch(turnId: string, patch: Partial<ChatTurnTraceRecord>): ChatTurnTraceRecord {
        const current = traces.get(turnId);
        if (!current) {
          throw new Error(`trace ${turnId} missing`);
        }
        const next: ChatTurnTraceRecord = {
          ...current,
          ...patch,
        };
        traces.set(turnId, next);
        return next;
      },
    },
    chatToolRuns: {
      create(input: ChatToolRunRecord): ChatToolRunRecord {
        toolRuns.set(input.toolRunId, input);
        return input;
      },
      patch(toolRunId: string, patch: Partial<ChatToolRunRecord>): ChatToolRunRecord {
        const current = toolRuns.get(toolRunId);
        if (!current) {
          throw new Error(`tool run ${toolRunId} missing`);
        }
        const next = {
          ...current,
          ...patch,
        };
        toolRuns.set(toolRunId, next);
        return next;
      },
      listByTurn(turnId: string): ChatToolRunRecord[] {
        return [...toolRuns.values()].filter((item) => item.turnId === turnId);
      },
    },
    chatInlineApprovals: {
      upsert: () => undefined,
    },
  };
}

describe("ChatAgentOrchestrator", () => {
  it("executes tool loop and returns final assistant message", async () => {
    const createChatCompletion = vi
      .fn<() => Promise<ChatCompletionResponse>>()
      .mockResolvedValueOnce(toolCallCompletion("latest ai tooling"))
      .mockResolvedValueOnce({
        model: "glm-5",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Final answer",
            },
          },
        ],
      });
    const invokeTool = vi.fn<() => Promise<ToolInvokeResult>>().mockResolvedValue({
      outcome: "executed",
      policyReason: "allowed",
      auditEventId: "audit-1",
      result: {
        results: [{ title: "Result", url: "https://example.com" }],
      },
    });
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(),
      createChatCompletion,
      invokeTool,
    });

    const result = await orchestrator.run({
      sessionId: "sess-1",
      turnId: randomUUID(),
      userMessageId: "msg-user-1",
      content: "Find AI tooling references from our notes",
      mode: "chat",
      providerId: "glm",
      model: "glm-5",
      webMode: "auto",
      memoryMode: "off",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      historyMessages: [{ role: "user", content: "Find AI tooling references from our notes" }],
    });

    expect(result.turnTrace.status).toBe("completed");
    expect(result.assistantContent).toContain("Final answer");
    expect(result.turnTrace.toolRuns.length).toBeGreaterThanOrEqual(1);
    expect(invokeTool).toHaveBeenCalledTimes(1);
  });

  it("trips circuit breaker for repeated non-retryable tool failures", async () => {
    const createChatCompletion = vi.fn<() => Promise<ChatCompletionResponse>>().mockResolvedValue(
      toolCallCompletion("latest ai tooling"),
    );
    const invokeTool = vi.fn<() => Promise<ToolInvokeResult>>().mockResolvedValue({
      outcome: "blocked",
      policyReason: "permission denied",
      auditEventId: "audit-2",
      result: {},
    });
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(),
      createChatCompletion,
      invokeTool,
    });

    const result = await orchestrator.run({
      sessionId: "sess-2",
      turnId: randomUUID(),
      userMessageId: "msg-user-2",
      content: "Search AI tooling references",
      mode: "chat",
      providerId: "glm",
      model: "glm-5",
      webMode: "auto",
      memoryMode: "off",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      historyMessages: [{ role: "user", content: "Search AI tooling references" }],
    });

    expect(invokeTool).toHaveBeenCalledTimes(2);
    expect(result.assistantContent).toContain("I stopped retrying tool calls because the same failure repeated.");
  });

  it("does not trip circuit breaker at two attempts for retryable failures", async () => {
    const createChatCompletion = vi
      .fn<() => Promise<ChatCompletionResponse>>()
      .mockResolvedValue(toolCallCompletion("latest ai tooling"));
    const invokeTool = vi.fn<() => Promise<ToolInvokeResult>>().mockRejectedValue(new Error("network timeout"));
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(),
      createChatCompletion,
      invokeTool,
    });

    const result = await orchestrator.run({
      sessionId: "sess-3",
      turnId: randomUUID(),
      userMessageId: "msg-user-3",
      content: "Search latest AI tooling",
      mode: "chat",
      providerId: "glm",
      model: "glm-5",
      webMode: "auto",
      memoryMode: "off",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      historyMessages: [{ role: "user", content: "Search latest AI tooling" }],
    });

    expect(invokeTool.mock.calls.length).toBeGreaterThan(2);
    expect(result.assistantContent).not.toContain("I stopped retrying tool calls because the same failure repeated.");
  });

  it("grounds browser.navigate from the most recent browser.search results", async () => {
    const createChatCompletion = vi
      .fn<() => Promise<ChatCompletionResponse>>()
      .mockResolvedValueOnce(navigateToolCallCompletion({}))
      .mockResolvedValueOnce({
        model: "glm-5",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Grounded answer",
            },
          },
        ],
      });
    const invokeTool = vi.fn<() => Promise<ToolInvokeResult>>()
      .mockResolvedValueOnce({
        outcome: "executed",
        policyReason: "allowed",
        auditEventId: "audit-search",
        result: {
          results: [{ title: "News", url: "https://example.com/news/kristi-noem", snippet: "snippet" }],
        },
      })
      .mockResolvedValueOnce({
        outcome: "executed",
        policyReason: "allowed",
        auditEventId: "audit-nav",
        result: {
          finalUrl: "https://example.com/news/kristi-noem",
          title: "News",
          textSnippet: "Latest coverage",
        },
      });
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(["browser.search", "browser.navigate"]),
      createChatCompletion,
      invokeTool,
    });

    const result = await orchestrator.run({
      sessionId: "sess-4",
      turnId: randomUUID(),
      userMessageId: "msg-user-4",
      content: "What's the latest news on Kristi Noem?",
      mode: "chat",
      providerId: "glm",
      model: "glm-5",
      webMode: "auto",
      memoryMode: "off",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      historyMessages: [{ role: "user", content: "What's the latest news on Kristi Noem?" }],
    });

    expect(invokeTool).toHaveBeenNthCalledWith(2, expect.objectContaining({
      toolName: "browser.navigate",
      args: expect.objectContaining({
        url: "https://example.com/news/kristi-noem",
      }),
    }));
    expect(invokeTool).toHaveBeenNthCalledWith(1, expect.objectContaining({
      toolName: "browser.search",
    }));
    expect(result.assistantContent).toContain("Grounded answer");
  });

  it("promotes repeated live-data browser.search calls into browser.navigate during preflight", async () => {
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(["browser.search", "browser.navigate"]),
      createChatCompletion: vi.fn(),
      invokeTool: vi.fn(),
    });

    const preflight = (orchestrator as unknown as {
      preflightToolInvocation(input: {
        toolName: string;
        rawArgs: Record<string, unknown>;
        userContent: string;
        priorToolRuns?: ChatToolRunRecord[];
      }): {
        toolName: string;
        args: Record<string, unknown>;
      };
    }).preflightToolInvocation({
      toolName: "browser.search",
      rawArgs: {
        query: "latest news on Kristi Noem",
      },
      userContent: "what's going on with kristi noem lately?",
      priorToolRuns: [
        {
          toolRunId: "tool-search-1",
          turnId: "turn-1",
          sessionId: "sess-6",
          toolName: "browser.search",
          status: "executed",
          args: { query: "latest news on Kristi Noem" },
          result: {
            results: [{ title: "Result 1", url: "https://example.com/news/kristi-noem-1", snippet: "snippet 1" }],
          },
          startedAt: "2026-03-06T22:30:00.000Z",
          finishedAt: "2026-03-06T22:30:01.000Z",
        },
      ],
    });

    expect(preflight.toolName).toBe("browser.navigate");
    expect(preflight.args).toMatchObject({
      url: "https://example.com/news/kristi-noem-1",
      maxChars: 6000,
    });
  });

  it("stops immediately on non-recoverable missing-argument failures", async () => {
    const createChatCompletion = vi
      .fn<() => Promise<ChatCompletionResponse>>()
      .mockResolvedValue(navigateToolCallCompletion({}));
    const invokeTool = vi.fn<() => Promise<ToolInvokeResult>>();
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(["browser.navigate"]),
      createChatCompletion,
      invokeTool,
    });

    const result = await orchestrator.run({
      sessionId: "sess-5",
      turnId: randomUUID(),
      userMessageId: "msg-user-5",
      content: "What's the latest news on Kristi Noem?",
      mode: "chat",
      providerId: "glm",
      model: "glm-5",
      webMode: "auto",
      memoryMode: "off",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      historyMessages: [{ role: "user", content: "What's the latest news on Kristi Noem?" }],
    });

    expect(createChatCompletion).toHaveBeenCalledTimes(1);
    expect(invokeTool).not.toHaveBeenCalled();
    expect(result.assistantContent).toContain("I stopped tool execution because the next step could not be safely recovered.");
    expect(result.assistantContent).toContain("execution error: url is required");
  });
});
