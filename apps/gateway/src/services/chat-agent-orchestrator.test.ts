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
    if (toolName === "browser.extract") {
      return {
        toolName: "browser.extract",
        category: "research",
        riskLevel: "safe",
        requiresApproval: false,
        description: "Extract page text",
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
    if (toolName === "http.get") {
      return {
        toolName: "http.get",
        category: "http",
        riskLevel: "safe",
        requiresApproval: false,
        description: "HTTP GET",
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
    if (toolName === "http.post") {
      return {
        toolName: "http.post",
        category: "http",
        riskLevel: "danger",
        requiresApproval: true,
        description: "HTTP POST",
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
    if (toolName === "time.now") {
      return {
        toolName: "time.now",
        category: "research",
        riskLevel: "safe",
        requiresApproval: false,
        description: "Current time",
        argSchema: {
          type: "object",
          properties: {},
          required: [],
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

function httpGetToolCallCompletion(args: Record<string, unknown>): ChatCompletionResponse {
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
              id: "call-http-get-1",
              type: "function",
              function: {
                name: "http_get",
                arguments: JSON.stringify(args),
              },
            },
          ],
        },
      },
    ],
  };
}

function httpPostToolCallCompletion(args: Record<string, unknown>): ChatCompletionResponse {
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
              id: "call-http-post-1",
              type: "function",
              function: {
                name: "http_post",
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

  it("recovers missing http.get url from the most recent visited page", async () => {
    const createChatCompletion = vi
      .fn<() => Promise<ChatCompletionResponse>>()
      .mockResolvedValueOnce(navigateToolCallCompletion({}))
      .mockResolvedValueOnce(navigateToolCallCompletion({}))
      .mockResolvedValueOnce(httpGetToolCallCompletion({}))
      .mockResolvedValueOnce({
        model: "glm-5",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Kristi Noem is in the news again.",
            },
          },
        ],
      });
    const invokeTool = vi.fn<() => Promise<ToolInvokeResult>>()
      .mockResolvedValueOnce({
        outcome: "executed",
        policyReason: "allowed",
        auditEventId: "audit-search-http",
        result: {
          results: [
            { title: "Kristi Noem latest news", url: "https://example.com/news/kristi-noem", snippet: "latest coverage" },
          ],
        },
      })
      .mockResolvedValueOnce({
        outcome: "executed",
        policyReason: "allowed",
        auditEventId: "audit-nav-http-1",
        result: {
          finalUrl: "https://example.com/news/kristi-noem",
          title: "Kristi Noem latest news",
          textSnippet: "first article page",
        },
      })
      .mockResolvedValueOnce({
        outcome: "executed",
        policyReason: "allowed",
        auditEventId: "audit-nav-http-2",
        result: {
          finalUrl: "https://example.com/news/kristi-noem/analysis",
          title: "Kristi Noem analysis",
          textSnippet: "second article page",
        },
      })
      .mockResolvedValueOnce({
        outcome: "executed",
        policyReason: "allowed",
        auditEventId: "audit-http-get",
        result: {
          url: "https://example.com/news/kristi-noem/analysis",
          status: 200,
          bodySnippet: "analysis body",
        },
      });
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(["browser.search", "browser.navigate", "http.get"]),
      createChatCompletion,
      invokeTool,
    });

    const result = await orchestrator.run({
      sessionId: "sess-http-get-1",
      turnId: randomUUID(),
      userMessageId: "msg-http-get-1",
      content: "what's the latest news on Kristi Noem?",
      mode: "chat",
      providerId: "glm",
      model: "glm-5",
      webMode: "auto",
      memoryMode: "off",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      historyMessages: [{ role: "user", content: "what's the latest news on Kristi Noem?" }],
    });

    expect(invokeTool).toHaveBeenNthCalledWith(4, expect.objectContaining({
      toolName: "http.get",
      args: expect.objectContaining({
        url: "https://example.com/news/kristi-noem/analysis",
      }),
    }));
    expect(result.assistantContent).toContain("Kristi Noem is in the news again.");
    expect(result.assistantContent).not.toContain("execution error: url is required");
  });

  it("uses the most recent visited page before falling back to prior search results for http.get", async () => {
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(["browser.search", "browser.navigate", "http.get"]),
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
        failureReason?: string;
      };
    }).preflightToolInvocation({
      toolName: "http.get",
      rawArgs: {},
      userContent: "what's the latest news on Kristi Noem?",
      priorToolRuns: [
        {
          toolRunId: "tool-search-http-1",
          turnId: "turn-http-1",
          sessionId: "sess-http-2",
          toolName: "browser.search",
          status: "executed",
          args: { query: "latest news on Kristi Noem" },
          result: {
            results: [
              { title: "Kristi Noem latest news", url: "https://example.com/news/kristi-noem", snippet: "snippet" },
            ],
          },
          startedAt: "2026-03-06T23:10:00.000Z",
          finishedAt: "2026-03-06T23:10:01.000Z",
        },
        {
          toolRunId: "tool-nav-http-1",
          turnId: "turn-http-1",
          sessionId: "sess-http-2",
          toolName: "browser.navigate",
          status: "executed",
          args: { url: "https://example.com/news/kristi-noem" },
          result: {
            finalUrl: "https://example.com/news/kristi-noem/live-blog",
            title: "Kristi Noem live blog",
            textSnippet: "live updates",
          },
          startedAt: "2026-03-06T23:10:02.000Z",
          finishedAt: "2026-03-06T23:10:03.000Z",
        },
      ],
    });

    expect(preflight.failureReason).toBeUndefined();
    expect(preflight.args).toMatchObject({
      url: "https://example.com/news/kristi-noem/live-blog",
    });
  });

  it("does not infer recent-run urls for http.post", async () => {
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(["browser.search", "browser.navigate", "http.post"]),
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
        failureReason?: string;
      };
    }).preflightToolInvocation({
      toolName: "http.post",
      rawArgs: {},
      userContent: "what's the latest news on Kristi Noem?",
      priorToolRuns: [
        {
          toolRunId: "tool-search-post-1",
          turnId: "turn-post-1",
          sessionId: "sess-post-1",
          toolName: "browser.search",
          status: "executed",
          args: { query: "latest news on Kristi Noem" },
          result: {
            results: [
              { title: "Kristi Noem latest news", url: "https://example.com/news/kristi-noem", snippet: "snippet" },
            ],
          },
          startedAt: "2026-03-06T23:11:00.000Z",
          finishedAt: "2026-03-06T23:11:01.000Z",
        },
        {
          toolRunId: "tool-nav-post-1",
          turnId: "turn-post-1",
          sessionId: "sess-post-1",
          toolName: "browser.navigate",
          status: "executed",
          args: { url: "https://example.com/news/kristi-noem" },
          result: {
            finalUrl: "https://example.com/news/kristi-noem/live-blog",
          },
          startedAt: "2026-03-06T23:11:02.000Z",
          finishedAt: "2026-03-06T23:11:03.000Z",
        },
      ],
    });

    expect(preflight.failureReason).toBe("execution error: url is required");
  });

  it("keeps http.get unresolved when no prompt or recent-run url is available", async () => {
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(["http.get"]),
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
        failureReason?: string;
      };
    }).preflightToolInvocation({
      toolName: "http.get",
      rawArgs: {},
      userContent: "tell me what's going on with Kristi Noem",
      priorToolRuns: [],
    });

    expect(preflight.failureReason).toBe("execution error: url is required");
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
            results: [
              { title: "Generic search results", url: "https://www.google.com/search?q=kristi+noem", snippet: "portal" },
              { title: "Kristi Noem latest news", url: "https://example.com/news/kristi-noem-1", snippet: "snippet 1" },
            ],
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

  it("does not inject browser.search for generic duration prompts containing time", async () => {
    const createChatCompletion = vi
      .fn<() => Promise<ChatCompletionResponse>>()
      .mockResolvedValueOnce({
        model: "glm-5",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Cold brew usually takes 12 to 24 hours.",
            },
          },
        ],
      });
    const invokeTool = vi.fn<() => Promise<ToolInvokeResult>>();
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(["browser.search", "time.now"]),
      createChatCompletion,
      invokeTool,
    });

    const result = await orchestrator.run({
      sessionId: "sess-time-1",
      turnId: randomUUID(),
      userMessageId: "msg-time-1",
      content: "how much time does it take to learn Go?",
      mode: "chat",
      providerId: "glm",
      model: "glm-5",
      webMode: "auto",
      memoryMode: "off",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      historyMessages: [{ role: "user", content: "how much time does it take to learn Go?" }],
    });

    expect(invokeTool).not.toHaveBeenCalled();
    expect(result.turnTrace.routing?.liveDataIntent).toBe(false);
    expect(result.assistantContent).toContain("12 to 24 hours");
  });

  it("treats explicit clock-time questions as time intent without using browser.search", async () => {
    const createChatCompletion = vi
      .fn<() => Promise<ChatCompletionResponse>>()
      .mockResolvedValueOnce({
        model: "glm-5",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "It is currently 9:00 AM in Tokyo.",
            },
          },
        ],
      });
    const invokeTool = vi.fn<() => Promise<ToolInvokeResult>>()
      .mockResolvedValueOnce({
        outcome: "executed",
        policyReason: "allowed",
        auditEventId: "audit-time",
        result: {
          iso: "2026-03-06T17:00:00.000Z",
          timezone: "Asia/Tokyo",
        },
      });
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(["browser.search", "time.now"]),
      createChatCompletion,
      invokeTool,
    });

    await orchestrator.run({
      sessionId: "sess-time-2",
      turnId: randomUUID(),
      userMessageId: "msg-time-2",
      content: "what time is it in Tokyo right now?",
      mode: "chat",
      providerId: "glm",
      model: "glm-5",
      webMode: "auto",
      memoryMode: "off",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      historyMessages: [{ role: "user", content: "what time is it in Tokyo right now?" }],
    });

    expect(invokeTool).toHaveBeenCalledTimes(1);
    expect(invokeTool).toHaveBeenCalledWith(expect.objectContaining({
      toolName: "time.now",
    }));
  });

  it("does not promote repeated search when recent results have no sufficiently relevant URL", async () => {
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
        query: "latest weather in Paris",
      },
      userContent: "what's the latest weather in Paris?",
      priorToolRuns: [
        {
          toolRunId: "tool-search-2",
          turnId: "turn-2",
          sessionId: "sess-7",
          toolName: "browser.search",
          status: "executed",
          args: { query: "latest weather in Paris" },
          result: {
            results: [{ title: "Search results", url: "https://www.google.com/search?q=weather+paris" }],
          },
          startedAt: "2026-03-06T22:31:00.000Z",
          finishedAt: "2026-03-06T22:31:01.000Z",
        },
      ],
    });

    expect(preflight.toolName).toBe("browser.search");
    expect(preflight.args).toMatchObject({
      query: "latest weather in Paris",
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
