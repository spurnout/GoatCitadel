import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { ChatCompletionRequest, ChatCompletionResponse, ChatToolRunRecord, ChatTurnTraceRecord, ToolCatalogEntry, ToolInvokeResult } from "@goatcitadel/contracts";
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
    expect(result.assistantContent).not.toContain("What I did instead");
    expect(result.assistantContent).not.toContain("What I need from you next");
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
    expect(result.assistantContent).not.toContain("What I did instead");
    expect(result.assistantContent).not.toContain("What I need from you next");
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

  it("normalizes generic live-news prompts into a cleaner search query", async () => {
    const createChatCompletion = vi
      .fn<() => Promise<ChatCompletionResponse>>()
      .mockResolvedValueOnce({
        model: "glm-5",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "I found some headlines.",
            },
          },
        ],
      });
    const invokeTool = vi.fn<() => Promise<ToolInvokeResult>>()
      .mockResolvedValueOnce({
        outcome: "executed",
        policyReason: "allowed",
        auditEventId: "audit-search-cleanup",
        result: {
          results: [
            { title: "Headline", url: "https://example.com/news/today", snippet: "top stories" },
          ],
        },
      });
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(["browser.search"]),
      createChatCompletion,
      invokeTool,
    });

    await orchestrator.run({
      sessionId: "sess-live-cleanup-1",
      turnId: randomUUID(),
      userMessageId: "msg-live-cleanup-1",
      content: "Look online and tell me the 5 most interesting things that happened today.",
      mode: "chat",
      providerId: "glm",
      model: "glm-5",
      webMode: "quick",
      memoryMode: "off",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      historyMessages: [{ role: "user", content: "Look online and tell me the 5 most interesting things that happened today." }],
    });

    expect(invokeTool).toHaveBeenNthCalledWith(1, expect.objectContaining({
      toolName: "browser.search",
      args: expect.objectContaining({
        query: "top news headlines today",
      }),
    }));
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

  it("ignores search-portal navigations when grounding a follow-up http.get", async () => {
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
          toolRunId: "tool-search-http-portal",
          turnId: "turn-http-portal",
          sessionId: "sess-http-portal",
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
          toolRunId: "tool-nav-http-portal",
          turnId: "turn-http-portal",
          sessionId: "sess-http-portal",
          toolName: "browser.navigate",
          status: "executed",
          args: { url: "https://lite.duckduckgo.com/lite/?q=latest+news+on+kristi+noem" },
          result: {
            finalUrl: "https://lite.duckduckgo.com/lite/?q=latest+news+on+kristi+noem",
            title: "DuckDuckGo",
            textSnippet: "Please complete the challenge to confirm this search was made by a human.",
          },
          startedAt: "2026-03-06T23:10:02.000Z",
          finishedAt: "2026-03-06T23:10:03.000Z",
        },
      ],
    });

    expect(preflight.failureReason).toBeUndefined();
    expect(preflight.args).toMatchObject({
      url: "https://example.com/news/kristi-noem",
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

  it("rewrites search-portal browser.navigate urls to a grounded result url", async () => {
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
      toolName: "browser.navigate",
      rawArgs: {
        url: "https://lite.duckduckgo.com/lite/?q=top+news+headlines+today",
      },
      userContent: "Look online and tell me the 5 most interesting things that happened today.",
      priorToolRuns: [
        {
          toolRunId: "tool-search-nav-redirect",
          turnId: "turn-nav-redirect",
          sessionId: "sess-nav-redirect",
          toolName: "browser.search",
          status: "executed",
          args: { query: "top news headlines today" },
          result: {
            results: [
              { title: "Google News - Headlines", url: "https://news.google.com/topics/CAAqKggKIiRDQkFTRlFvSUwyMHZNRFZxYUdjU0JXVnVMVWRDR2dKVFJ5Z0FQAQ", snippet: "Headlines topic" },
              { title: "Reuters Top News", url: "https://www.reuters.com/world/", snippet: "Top stories from Reuters" },
            ],
          },
          startedAt: "2026-03-06T22:30:00.000Z",
          finishedAt: "2026-03-06T22:30:01.000Z",
        },
      ],
    });

    expect(preflight.toolName).toBe("browser.navigate");
    expect(preflight.args.url).toBe("https://news.google.com/topics/CAAqKggKIiRDQkFTRlFvSUwyMHZNRFZxYUdjU0JXVnVMVWRDR2dKVFJ5Z0FQAQ");
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

  it("injects evidence grounding instruction when live-data intent triggers a proactive search", async () => {
    const createChatCompletion = vi
      .fn<() => Promise<ChatCompletionResponse>>()
      .mockResolvedValueOnce({
        model: "glm-5",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Here are headlines based on search results.",
            },
          },
        ],
      });
    const invokeTool = vi.fn<() => Promise<ToolInvokeResult>>()
      .mockResolvedValueOnce({
        outcome: "executed",
        policyReason: "allowed",
        auditEventId: "audit-grounding",
        result: {
          results: [
            { title: "Top story", url: "https://example.com/top-story", snippet: "Important news" },
          ],
        },
      });
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(["browser.search"]),
      createChatCompletion,
      invokeTool,
    });

    await orchestrator.run({
      sessionId: "sess-grounding-1",
      turnId: randomUUID(),
      userMessageId: "msg-grounding-1",
      content: "What are the latest news headlines today?",
      mode: "chat",
      providerId: "glm",
      model: "glm-5",
      webMode: "quick",
      memoryMode: "off",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      historyMessages: [{ role: "user", content: "What are the latest news headlines today?" }],
    });

    expect(createChatCompletion).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const completionCall = (createChatCompletion as any).mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    const messages = completionCall?.messages as Array<{ role: string; content?: unknown }> | undefined;
    const systemMessages = messages?.filter((msg) => msg.role === "system") ?? [];
    const groundingMsg = systemMessages.find(
      (msg) => typeof msg.content === "string" && msg.content.includes("Evidence grounding"),
    );
    expect(groundingMsg).toBeDefined();
    expect(groundingMsg?.content as string).toContain("strictly on the tool results");
  });

  it("detects explicit web lookup phrases like 'search online' as live-data intent", async () => {
    const createChatCompletion = vi
      .fn<() => Promise<ChatCompletionResponse>>()
      .mockResolvedValueOnce({
        model: "glm-5",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Search results found.",
            },
          },
        ],
      });
    const invokeTool = vi.fn<() => Promise<ToolInvokeResult>>()
      .mockResolvedValueOnce({
        outcome: "executed",
        policyReason: "allowed",
        auditEventId: "audit-search-online",
        result: {
          results: [{ title: "Result", url: "https://example.com", snippet: "snippet" }],
        },
      });
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(["browser.search"]),
      createChatCompletion,
      invokeTool,
    });

    const result = await orchestrator.run({
      sessionId: "sess-search-online-1",
      turnId: randomUUID(),
      userMessageId: "msg-search-online-1",
      content: "Search online for the best project management tools",
      mode: "chat",
      providerId: "glm",
      model: "glm-5",
      webMode: "auto",
      memoryMode: "off",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      historyMessages: [{ role: "user", content: "Search online for the best project management tools" }],
    });

    expect(result.turnTrace.routing?.liveDataIntent).toBe(true);
    expect(invokeTool).toHaveBeenCalledWith(expect.objectContaining({
      toolName: "browser.search",
    }));
  });

  it("does not trigger proactive web search for generic current-state prompts", async () => {
    const createChatCompletion = vi
      .fn<() => Promise<ChatCompletionResponse>>()
      .mockResolvedValueOnce({
        model: "glm-5",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Here is a local summary.",
            },
          },
        ],
      });
    const invokeTool = vi.fn<() => Promise<ToolInvokeResult>>();
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(["browser.search"]),
      createChatCompletion,
      invokeTool,
    });

    const result = await orchestrator.run({
      sessionId: "sess-current-architecture-1",
      turnId: randomUUID(),
      userMessageId: "msg-current-architecture-1",
      content: "Summarize the current architecture of the app.",
      mode: "chat",
      providerId: "glm",
      model: "glm-5",
      webMode: "auto",
      memoryMode: "off",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      historyMessages: [{ role: "user", content: "Summarize the current architecture of the app." }],
    });

    expect(invokeTool).not.toHaveBeenCalled();
    expect(result.turnTrace.routing?.liveDataIntent).toBe(false);
  });

  it("asks for clarification instead of faking an estimate for ambiguous local-area prompts", async () => {
    const createChatCompletion = vi.fn<() => Promise<ChatCompletionResponse>>();
    const invokeTool = vi.fn<() => Promise<ToolInvokeResult>>();
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(["browser.search"]),
      createChatCompletion,
      invokeTool,
    });

    const result = await orchestrator.run({
      sessionId: "sess-lonely-area-1",
      turnId: randomUUID(),
      userMessageId: "msg-lonely-area-1",
      content: "Estimate the number of genuinely lonely singles in the area by combining demographic data, social indicators, and digital behavior patterns.",
      mode: "chat",
      providerId: "glm",
      model: "glm-5",
      webMode: "auto",
      memoryMode: "auto",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      historyMessages: [{ role: "user", content: "Estimate the number of genuinely lonely singles in the area by combining demographic data, social indicators, and digital behavior patterns." }],
    });

    expect(createChatCompletion).not.toHaveBeenCalled();
    expect(invokeTool).not.toHaveBeenCalled();
    expect(result.assistantContent).toContain("answering that responsibly");
    expect(result.assistantContent).toContain("geographic area");
    expect(result.assistantContent).toContain("threshold");
  });

  it("still asks about subjective qualifier when geography is named but definition is ambiguous", async () => {
    const createChatCompletion = vi.fn<() => Promise<ChatCompletionResponse>>();
    const invokeTool = vi.fn<() => Promise<ToolInvokeResult>>();
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(["browser.search"]),
      createChatCompletion,
      invokeTool,
    });

    const result = await orchestrator.run({
      sessionId: "sess-lonely-seattle-1",
      turnId: randomUUID(),
      userMessageId: "msg-lonely-seattle-1",
      content: "Estimate the number of genuinely lonely singles in Seattle by combining demographic data, social indicators, and digital behavior patterns.",
      mode: "chat",
      providerId: "glm",
      model: "glm-5",
      webMode: "auto",
      memoryMode: "off",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      historyMessages: [{ role: "user", content: "Estimate the number of genuinely lonely singles in Seattle by combining demographic data, social indicators, and digital behavior patterns." }],
    });

    expect(createChatCompletion).not.toHaveBeenCalled();
    expect(result.assistantContent).toContain("answering that responsibly");
    expect(result.assistantContent).toContain("threshold");
    expect(result.assistantContent).not.toContain("geographic area");
  });

  it("does not force clarification when both geography and qualifier are concrete", async () => {
    const createChatCompletion = vi
      .fn<() => Promise<ChatCompletionResponse>>()
      .mockResolvedValueOnce({
        model: "glm-5",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "I can estimate that for Seattle with stated assumptions.",
            },
          },
        ],
      });
    const invokeTool = vi.fn<() => Promise<ToolInvokeResult>>();
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(["browser.search"]),
      createChatCompletion,
      invokeTool,
    });

    const result = await orchestrator.run({
      sessionId: "sess-seattle-concrete-1",
      turnId: randomUUID(),
      userMessageId: "msg-seattle-concrete-1",
      content: "Estimate the number of single adults in Seattle by combining demographic data and digital behavior patterns.",
      mode: "chat",
      providerId: "glm",
      model: "glm-5",
      webMode: "auto",
      memoryMode: "off",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      historyMessages: [{ role: "user", content: "Estimate the number of single adults in Seattle by combining demographic data and digital behavior patterns." }],
    });

    expect(createChatCompletion).toHaveBeenCalledTimes(1);
    expect(result.assistantContent).toContain("Seattle");
  });

  it("carries clarification context forward instead of searching on a partial follow-up answer", async () => {
    const createChatCompletion = vi.fn<() => Promise<ChatCompletionResponse>>();
    const invokeTool = vi.fn<() => Promise<ToolInvokeResult>>();
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(["browser.search"]),
      createChatCompletion,
      invokeTool,
    });

    const result = await orchestrator.run({
      sessionId: "sess-lonely-followup-1",
      turnId: randomUUID(),
      userMessageId: "msg-lonely-followup-1",
      content: "Suburbs generally lonely is defined as \"I cry myself to sleep all alone\".",
      mode: "chat",
      providerId: "glm",
      model: "glm-5",
      webMode: "auto",
      memoryMode: "auto",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      historyMessages: [
        {
          role: "user",
          content: "Estimate the number of genuinely lonely singles in the area by combining demographic data, social indicators, and digital behavior patterns.",
        },
        {
          role: "assistant",
          content: [
            "I need a quick clarification before answering that responsibly:",
            "- What geographic area do you mean exactly: city, metro, county, state, or country?",
            "- How are you defining that qualifier — what threshold or criteria should I use?",
            "Once you answer, I can give you a grounded response.",
          ].join("\n"),
        },
      ],
    });

    expect(createChatCompletion).not.toHaveBeenCalled();
    expect(invokeTool).not.toHaveBeenCalled();
    expect(result.assistantContent).toContain("answering that responsibly");
    expect(result.assistantContent).toContain("geographic area");
    expect(result.assistantContent).not.toContain("threshold");
  });

  it("returns a deterministic settings note for live-data prompts when web mode is off", async () => {
    const createChatCompletion = vi.fn<() => Promise<ChatCompletionResponse>>();
    const invokeTool = vi.fn<() => Promise<ToolInvokeResult>>();
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(["browser.search", "browser.navigate"]),
      createChatCompletion,
      invokeTool,
    });

    const result = await orchestrator.run({
      sessionId: "sess-web-off-live-data-1",
      turnId: randomUUID(),
      userMessageId: "msg-web-off-live-data-1",
      content: "What are the latest news headlines about OpenAI today?",
      mode: "chat",
      providerId: "glm",
      model: "glm-5",
      webMode: "off",
      memoryMode: "off",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      historyMessages: [{ role: "user", content: "What are the latest news headlines about OpenAI today?" }],
    });

    expect(createChatCompletion).not.toHaveBeenCalled();
    expect(invokeTool).not.toHaveBeenCalled();
    expect(result.assistantContent).toContain("Web is set to Off");
    expect(result.assistantContent).toContain("Auto, Quick, or Deep");
  });

  it("strips web tools from normal turns when web mode is off", async () => {
    const createChatCompletion = vi
      .fn<(request: ChatCompletionRequest) => Promise<ChatCompletionResponse>>()
      .mockImplementationOnce(async (request) => {
        const toolNames = (request.tools ?? [])
          .map((tool) => (tool.function as { name?: string } | undefined)?.name)
          .filter((name): name is string => Boolean(name));
        expect(toolNames).not.toContain("browser_search");
        expect(toolNames).toContain("time_now");
        return {
          model: "glm-5",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: "Local-only answer.",
              },
            },
          ],
        };
      });
    const invokeTool = vi.fn<() => Promise<ToolInvokeResult>>();
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(["browser.search", "time.now"]),
      createChatCompletion,
      invokeTool,
    });

    const result = await orchestrator.run({
      sessionId: "sess-web-off-local-only-1",
      turnId: randomUUID(),
      userMessageId: "msg-web-off-local-only-1",
      content: "Explain HTTP status codes for an internal API.",
      mode: "chat",
      providerId: "glm",
      model: "glm-5",
      webMode: "off",
      memoryMode: "off",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      historyMessages: [{ role: "user", content: "Explain HTTP status codes for an internal API." }],
    });

    expect(createChatCompletion).toHaveBeenCalledTimes(1);
    expect(invokeTool).not.toHaveBeenCalled();
    expect(result.assistantContent).toContain("Local-only answer");
  });

  it("returns a deterministic settings note for live-data prompts when tool autonomy is manual", async () => {
    const createChatCompletion = vi.fn<() => Promise<ChatCompletionResponse>>();
    const invokeTool = vi.fn<() => Promise<ToolInvokeResult>>();
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(["browser.search"]),
      createChatCompletion,
      invokeTool,
    });

    const result = await orchestrator.run({
      sessionId: "sess-manual-live-data-1",
      turnId: randomUUID(),
      userMessageId: "msg-manual-live-data-1",
      content: "Look online and tell me the 5 most interesting things that happened today.",
      mode: "chat",
      providerId: "glm",
      model: "glm-5",
      webMode: "auto",
      memoryMode: "off",
      thinkingLevel: "standard",
      toolAutonomy: "manual",
      historyMessages: [{ role: "user", content: "Look online and tell me the 5 most interesting things that happened today." }],
    });

    expect(createChatCompletion).not.toHaveBeenCalled();
    expect(invokeTool).not.toHaveBeenCalled();
    expect(result.assistantContent).toContain("tool autonomy is set to Manual");
    expect(result.assistantContent).toContain("Safe Auto");
  });

  it("does not trap a fresh standalone prompt in an old clarification exchange", async () => {
    const createChatCompletion = vi
      .fn<() => Promise<ChatCompletionResponse>>()
      .mockResolvedValueOnce({
        model: "glm-5",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "The capital of France is Paris.",
            },
          },
        ],
      });
    const invokeTool = vi.fn<() => Promise<ToolInvokeResult>>();
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(["browser.search"]),
      createChatCompletion,
      invokeTool,
    });

    const result = await orchestrator.run({
      sessionId: "sess-clarification-reset-1",
      turnId: randomUUID(),
      userMessageId: "msg-clarification-reset-1",
      content: "What is the capital of France?",
      mode: "chat",
      providerId: "glm",
      model: "glm-5",
      webMode: "auto",
      memoryMode: "off",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      historyMessages: [
        {
          role: "user",
          content: "Estimate the number of genuinely lonely singles in the area by combining demographic data, social indicators, and digital behavior patterns.",
        },
        {
          role: "assistant",
          content: [
            "I need a quick clarification before answering that responsibly:",
            "- What geographic area do you mean exactly: city, metro, county, state, or country?",
            "- How are you defining that qualifier — what threshold or criteria should I use?",
            "Once you answer, I can give you a grounded response.",
          ].join("\n"),
        },
      ],
    });

    expect(createChatCompletion).toHaveBeenCalledTimes(1);
    expect(invokeTool).not.toHaveBeenCalled();
    expect(result.assistantContent).toContain("Paris");
  });

  it("ignores stale clarifications once a later assistant turn has moved on", async () => {
    const createChatCompletion = vi
      .fn<() => Promise<ChatCompletionResponse>>()
      .mockResolvedValueOnce({
        model: "glm-5",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "The capital of France is Paris.",
            },
          },
        ],
      });
    const invokeTool = vi.fn<() => Promise<ToolInvokeResult>>();
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(["browser.search"]),
      createChatCompletion,
      invokeTool,
    });

    const result = await orchestrator.run({
      sessionId: "sess-clarification-reset-2",
      turnId: randomUUID(),
      userMessageId: "msg-clarification-reset-2",
      content: "What is the capital of France?",
      mode: "chat",
      providerId: "glm",
      model: "glm-5",
      webMode: "auto",
      memoryMode: "off",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      historyMessages: [
        {
          role: "user",
          content: "Estimate the number of genuinely lonely singles in the area by combining demographic data, social indicators, and digital behavior patterns.",
        },
        {
          role: "assistant",
          content: [
            "I need a quick clarification before answering that responsibly:",
            "- What geographic area do you mean exactly: city, metro, county, state, or country?",
            "- How are you defining that qualifier — what threshold or criteria should I use?",
            "Once you answer, I can give you a grounded response.",
          ].join("\n"),
        },
        {
          role: "user",
          content: "Never mind.",
        },
        {
          role: "assistant",
          content: "Okay, we can drop that one.",
        },
      ],
    });

    expect(createChatCompletion).toHaveBeenCalledTimes(1);
    expect(invokeTool).not.toHaveBeenCalled();
    expect(result.assistantContent).toContain("Paris");
  });
});
