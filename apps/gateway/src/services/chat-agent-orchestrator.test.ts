import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatToolRunRecord,
  ChatTurnTraceRecord,
  McpInvokeRequest,
  McpInvokeResponse,
  ToolCatalogEntry,
  ToolInvokeResult,
} from "@goatcitadel/contracts";
import { ChatAgentOrchestrator } from "./chat-agent-orchestrator.js";
import type { McpBrowserFallbackTarget } from "./mcp-runtime.js";

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
      listBySession(sessionId: string): ChatToolRunRecord[] {
        return [...toolRuns.values()].filter((item) => item.sessionId === sessionId);
      },
    },
    chatSessionProjects: {
      get: () => undefined,
    },
    chatExecutionPlans: {
      listBySession: () => [],
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

  it("marks the turn cancelled when execution is aborted mid-run", async () => {
    const controller = new AbortController();
    const createChatCompletion = vi.fn(async (_request: ChatCompletionRequest) => {
      controller.abort();
      throw new Error("Chat turn cancelled.");
    });
    const invokeTool = vi.fn<() => Promise<ToolInvokeResult>>();
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(),
      createChatCompletion,
      invokeTool,
    });

    const result = await orchestrator.run({
      sessionId: "sess-cancel-1",
      turnId: randomUUID(),
      userMessageId: "msg-user-cancel-1",
      content: "Stop this turn.",
      mode: "chat",
      providerId: "glm",
      model: "glm-5",
      webMode: "auto",
      memoryMode: "off",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      historyMessages: [{ role: "user", content: "Stop this turn." }],
      signal: controller.signal,
    });

    expect(result.turnTrace.status).toBe("cancelled");
    expect(result.assistantContent).toBe("");
    expect(invokeTool).not.toHaveBeenCalled();
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
    expect(result.assistantContent).toContain("I hit the same tool issue repeatedly");
    expect(result.assistantContent).toContain("I do not have a reliable enough partial answer yet.");
    expect(result.assistantContent).not.toContain("Reason:");
    expect(result.assistantContent).not.toContain("permission denied");
    expect(result.turnTrace.failure?.recommendedAction).toBe("retry_narrower");
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
    expect(result.assistantContent).not.toContain("I hit the same tool issue repeatedly");
    expect(result.assistantContent).not.toContain("Reason:");
    expect(result.assistantContent).not.toContain("What I need from you next");
  });

  it("maps auth failures to reconnect auth recovery guidance", async () => {
    const createChatCompletion = vi.fn<() => Promise<ChatCompletionResponse>>()
      .mockRejectedValue(new Error("401 unauthorized"));
    const invokeTool = vi.fn<() => Promise<ToolInvokeResult>>();
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(),
      createChatCompletion,
      invokeTool,
    });

    const result = await orchestrator.run({
      sessionId: "sess-auth-1",
      turnId: randomUUID(),
      userMessageId: "msg-user-auth-1",
      content: "Use the locked provider.",
      mode: "chat",
      providerId: "glm",
      model: "glm-5",
      webMode: "auto",
      memoryMode: "off",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      historyMessages: [{ role: "user", content: "Use the locked provider." }],
    });

    expect(result.turnTrace.status).toBe("failed");
    expect(result.turnTrace.failure?.failureClass).toBe("auth_required");
    expect(result.turnTrace.failure?.recommendedAction).toBe("reconnect_auth");
    expect(result.assistantContent).toContain("needs valid auth");
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

    const invokeToolCalls = invokeTool.mock.calls as unknown as Array<[{
      toolName: string;
      args: Record<string, unknown>;
    }]>;
    const lastInvokeToolCall = invokeToolCalls.at(-1)?.[0];
    expect(lastInvokeToolCall).toMatchObject({
      toolName: "http.get",
      args: expect.objectContaining({
        url: "https://example.com/news/kristi-noem/analysis",
      }),
    });
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
    expect(result.assistantContent).toContain("I hit a tool issue that was not safe to keep retrying.");
    expect(result.assistantContent).toContain("The blocker was in navigate.");
    expect(result.assistantContent).not.toContain("execution error: url is required");
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

  it("treats release-window prompts like this week as live-data intent", async () => {
    const createChatCompletion = vi
      .fn<() => Promise<ChatCompletionResponse>>()
      .mockResolvedValueOnce({
        model: "glm-5",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Here are the strongest current leads.",
            },
          },
        ],
      });
    const invokeTool = vi
      .fn<() => Promise<ToolInvokeResult>>()
      .mockResolvedValueOnce({
        outcome: "executed",
        policyReason: "allowed",
        auditEventId: "audit-movies-week-1",
        result: {
          results: [
            {
              title: "IMDb upcoming releases",
              url: "https://www.imdb.com/calendar/",
              snippet: "Upcoming movie releases this week.",
            },
          ],
        },
      });
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(["browser.search"]),
      createChatCompletion,
      invokeTool,
    });

    const result = await orchestrator.run({
      sessionId: "sess-movies-week-1",
      turnId: randomUUID(),
      userMessageId: "msg-movies-week-1",
      content: "What movies are coming out this week?",
      mode: "chat",
      providerId: "glm",
      model: "glm-5",
      webMode: "auto",
      memoryMode: "off",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      historyMessages: [{ role: "user", content: "What movies are coming out this week?" }],
    });

    expect(result.turnTrace.routing?.liveDataIntent).toBe(true);
    expect(invokeTool).toHaveBeenCalledWith(expect.objectContaining({
      toolName: "browser.search",
      args: expect.objectContaining({
        query: "What movies are coming out this week",
      }),
    }));
  });

  it("retries remote-blocked browser navigation through MCP fallback tiers", async () => {
    const invokeTool = vi
      .fn<() => Promise<ToolInvokeResult>>()
      .mockResolvedValueOnce({
        outcome: "executed",
        policyReason: "allowed",
        auditEventId: "audit-remote-blocked-1",
        result: {
          url: "https://movieinsider.com/movies",
          finalUrl: "https://movieinsider.com/movies",
          status: 403,
          title: "Attention Required! | Cloudflare",
          textSnippet: "Sorry, you have been blocked. Cloudflare Ray ID.",
        },
      });
    const invokeMcpTool = vi
      .fn<() => Promise<McpInvokeResponse>>()
      .mockResolvedValueOnce({
        ok: true,
        output: {
          structuredContent: {
            url: "https://www.imdb.com/calendar/",
            finalUrl: "https://www.imdb.com/calendar/",
            status: 200,
            title: "IMDb Release Calendar",
            textSnippet: "Upcoming movies this week.",
          },
        },
      });
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(["browser.navigate"]),
      createChatCompletion: vi.fn(),
      invokeTool,
      invokeMcpTool,
      listMcpBrowserFallbackTargets: () => [
        {
          serverId: "srv-playwright",
          label: "Playwright MCP",
          tier: "playwright_mcp",
          navigateToolName: "browser.navigate",
          extractToolName: "browser.extract",
        },
      ],
    });

    const executed = await (orchestrator as unknown as {
      executeToolCall(input: {
        input: {
          sessionId: string;
          content: string;
          mode: "chat";
          providerId: string;
          model: string;
          webMode: "auto";
          memoryMode: "off";
          thinkingLevel: "standard";
          toolAutonomy: "safe_auto";
        };
        turnId: string;
        toolName: string;
        rawArgs: Record<string, unknown>;
      }): Promise<{ record: ChatToolRunRecord }>;
    }).executeToolCall({
      input: {
        sessionId: "sess-mcp-fallback-1",
        content: "What movies are coming out this week?",
        mode: "chat",
        providerId: "glm",
        model: "glm-5",
        webMode: "auto",
        memoryMode: "off",
        thinkingLevel: "standard",
        toolAutonomy: "safe_auto",
      },
      turnId: "turn-mcp-fallback-1",
      toolName: "browser.navigate",
      rawArgs: {
        url: "https://movieinsider.com/movies",
      },
    });

    expect(invokeTool).toHaveBeenCalledTimes(1);
    expect(invokeMcpTool).toHaveBeenCalledWith(expect.objectContaining({
      serverId: "srv-playwright",
      toolName: "browser.navigate",
      arguments: expect.objectContaining({
        url: "https://movieinsider.com/movies",
      }),
    }));
    expect(executed.record.status).toBe("executed");
    expect(executed.record.result).toMatchObject({
      engineTier: "playwright_mcp",
      engineLabel: "Playwright MCP",
      finalUrl: "https://www.imdb.com/calendar/",
    });
    expect(Array.isArray(executed.record.result?.fallbackChain)).toBe(true);
    expect((executed.record.result?.fallbackChain as Array<Record<string, unknown>>)[0]).toMatchObject({
      engineTier: "builtin",
      browserFailureClass: "remote_blocked",
      status: "failed",
    });
  });

  it("stops MCP browser fallback tiers when the turn budget expires mid-fallback", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T20:00:00.000Z"));
    try {
      const invokeTool = vi
        .fn<() => Promise<ToolInvokeResult>>()
        .mockResolvedValueOnce({
          outcome: "executed",
          policyReason: "allowed",
          auditEventId: "audit-mcp-budget-nav-1",
          result: {
            url: "https://blocked-site.com/article",
            finalUrl: "https://blocked-site.com/article",
            status: 403,
            title: "Attention Required! | Cloudflare",
            textSnippet: "Sorry, you have been blocked. Cloudflare Ray ID.",
          },
        });
      const invokeMcpTool = vi
        .fn<(request: McpInvokeRequest) => Promise<McpInvokeResponse>>()
        .mockImplementation(async (request: McpInvokeRequest) => {
          vi.setSystemTime(new Date(Date.now() + 15000));
          return {
            ok: false,
            error: `${request.serverId} timed out`,
          };
        });
      const orchestrator = new ChatAgentOrchestrator({
        storage: createMockStorage() as never,
        listToolCatalog: () => createToolCatalog(["browser.navigate"]),
        createChatCompletion: vi.fn(),
        invokeTool,
        invokeMcpTool,
        listMcpBrowserFallbackTargets: () => [
          {
            serverId: "srv-playwright",
            label: "Playwright MCP",
            tier: "playwright_mcp",
            navigateToolName: "browser.navigate",
            extractToolName: "browser.extract",
          },
          {
            serverId: "srv-browserbase",
            label: "Browserbase MCP",
            tier: "browser_mcp",
            navigateToolName: "browser.navigate",
            extractToolName: "browser.extract",
          },
          {
            serverId: "srv-cdp",
            label: "CDP MCP",
            tier: "browser_mcp",
            navigateToolName: "browser.navigate",
            extractToolName: "browser.extract",
          },
        ],
      });

      const executed = await (orchestrator as unknown as {
        executeToolCall(input: {
          input: {
            sessionId: string;
            content: string;
            mode: "chat";
            providerId: string;
            model: string;
            webMode: "auto";
            memoryMode: "off";
            thinkingLevel: "standard";
            toolAutonomy: "safe_auto";
          };
          turnId: string;
          toolName: string;
          rawArgs: Record<string, unknown>;
          turnBudgetDeadline?: number;
        }): Promise<{ record: ChatToolRunRecord }>;
      }).executeToolCall({
        input: {
          sessionId: "sess-mcp-budget-1",
          content: "What's the latest news today?",
          mode: "chat",
          providerId: "glm",
          model: "glm-5",
          webMode: "auto",
          memoryMode: "off",
          thinkingLevel: "standard",
          toolAutonomy: "safe_auto",
        },
        turnId: "turn-mcp-budget-1",
        toolName: "browser.navigate",
        rawArgs: {
          url: "https://blocked-site.com/article",
        },
        turnBudgetDeadline: Date.now() + 25000,
      });

      expect(invokeMcpTool).toHaveBeenCalledTimes(2);
      expect(executed.record.status).toBe("failed");
      expect(Array.isArray(executed.record.result?.fallbackChain)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("poisons blocked hosts when selecting the next grounded browser result", async () => {
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
      rawArgs: { url: "https://lite.duckduckgo.com/lite/?q=movies+this+week" },
      userContent: "What movies are coming out this week?",
      priorToolRuns: [
        {
          toolRunId: "tool-search-movies-1",
          turnId: "turn-movies-1",
          sessionId: "sess-movies-1",
          toolName: "browser.search",
          status: "executed",
          args: { query: "movies coming out this week" },
          result: {
            results: [
              { title: "Movie Insider releases", url: "https://www.movieinsider.com/movies", snippet: "Releases" },
              { title: "Movies coming out this week - IMDb", url: "https://www.imdb.com/calendar/", snippet: "Upcoming releases this week." },
            ],
          },
          startedAt: "2026-03-10T01:00:00.000Z",
          finishedAt: "2026-03-10T01:00:01.000Z",
        },
        {
          toolRunId: "tool-nav-movies-1",
          turnId: "turn-movies-1",
          sessionId: "sess-movies-1",
          toolName: "browser.navigate",
          status: "failed",
          args: { url: "https://www.movieinsider.com/movies" },
          result: {
            url: "https://www.movieinsider.com/movies",
            finalUrl: "https://www.movieinsider.com/movies",
            status: 403,
            browserFailureClass: "remote_blocked",
          },
          error: "remote site blocked automation (Cloudflare 403)",
          startedAt: "2026-03-10T01:00:02.000Z",
          finishedAt: "2026-03-10T01:00:03.000Z",
        },
      ],
    });

    expect(preflight.toolName).toBe("browser.navigate");
    expect(preflight.args).toMatchObject({
      url: "https://www.imdb.com/calendar/",
    });
  });

  it("surfaces blocked-source fallback copy instead of generic retry wording", async () => {
    const createChatCompletion = vi
      .fn<() => Promise<ChatCompletionResponse>>()
      .mockResolvedValueOnce(navigateToolCallCompletion({ url: "https://www.movieinsider.com/movies" }))
      .mockResolvedValueOnce(navigateToolCallCompletion({ url: "https://www.movieinsider.com/movies" }));
    const invokeTool = vi
      .fn<() => Promise<ToolInvokeResult>>()
      .mockResolvedValue({
        outcome: "executed",
        policyReason: "allowed",
        auditEventId: "audit-movieinsider-blocked",
        result: {
          url: "https://www.movieinsider.com/movies",
          finalUrl: "https://www.movieinsider.com/movies",
          status: 403,
          title: "Attention Required! | Cloudflare",
          textSnippet: "Sorry, you have been blocked. Cloudflare Ray ID.",
        },
      });
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(["browser.navigate"]),
      createChatCompletion,
      invokeTool,
    });

    const result = await orchestrator.run({
      sessionId: "sess-movieinsider-blocked-1",
      turnId: randomUUID(),
      userMessageId: "msg-movieinsider-blocked-1",
      content: "What movies are coming out this week?",
      mode: "chat",
      providerId: "glm",
      model: "glm-5",
      webMode: "auto",
      memoryMode: "off",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      historyMessages: [{ role: "user", content: "What movies are coming out this week?" }],
    });

    expect(result.assistantContent).toContain("A source blocked automated browsing");
    expect(result.assistantContent).toContain("movieinsider.com");
  });

  it("grounds vague retry prompts to the prior topic instead of searching the literal phrase", async () => {
    const createChatCompletion = vi
      .fn<() => Promise<ChatCompletionResponse>>()
      .mockResolvedValueOnce(toolCallCompletion("retry with a better fallback"))
      .mockResolvedValueOnce({
        model: "glm-5",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "The main REST API use cases are CRUD, integrations, mobile backends, automation, and partner-facing services.",
            },
          },
        ],
      });
    const invokeTool = vi
      .fn<() => Promise<ToolInvokeResult>>()
      .mockResolvedValue({
        outcome: "executed",
        policyReason: "allowed",
        auditEventId: "audit-rest-retry-grounded-1",
        result: {
          query: "top 5 ways REST APIs are used",
          results: [
            { title: "What Is REST API? Examples, Uses & Challenges - Postman Blog", url: "https://blog.postman.com/rest-api-examples/", snippet: "Examples and common use cases." },
            { title: "REST API Introduction - GeeksforGeeks", url: "https://www.geeksforgeeks.org/rest-api-introduction/", snippet: "REST principles and use cases." },
          ],
        },
      });
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(["browser.search"]),
      createChatCompletion,
      invokeTool,
    });

    const result = await orchestrator.run({
      sessionId: "sess-rest-retry-grounded-1",
      turnId: randomUUID(),
      userMessageId: "msg-rest-retry-grounded-1",
      content: "Please retry with a better fallback",
      mode: "chat",
      providerId: "glm",
      model: "glm-5",
      webMode: "auto",
      memoryMode: "off",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      historyMessages: [
        { role: "user", content: "Can you look into the top 5 ways that a REST API can be used?" },
        {
          role: "assistant",
          content: [
            "A source blocked automated browsing on blog.postman.com, so I'm falling back to the strongest leads I recovered so far:",
            "",
            "1. What Is a REST API? Examples, Uses & Challenges - Postman Blog",
            "2. REST API Introduction - GeeksforGeeks",
          ].join("\n"),
        },
        { role: "user", content: "Please retry with a better fallback" },
      ],
    });

    expect(invokeTool).toHaveBeenCalledTimes(1);
    const groundedRetryCalls = invokeTool.mock.calls as unknown as Array<[{ toolName: string; args: Record<string, unknown> }]>;
    const groundedRetryCall = groundedRetryCalls[0]![0]!;
    expect(groundedRetryCall).toMatchObject({
      toolName: "browser.search",
      args: expect.objectContaining({
        query: expect.stringMatching(/rest api/i),
      }),
    });
    expect(String(groundedRetryCall.args.query)).not.toMatch(/better fallback/i);
    expect(result.assistantContent).toContain("REST API");
  });

  it("prefers structured browser search alternatives over literal retry text", async () => {
    const createChatCompletion = vi
      .fn<() => Promise<ChatCompletionResponse>>()
      .mockResolvedValueOnce({
        model: "kimi-k2.5",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "",
              tool_calls: [
                {
                  id: "call-search-kimi-1",
                  type: "function",
                  function: {
                    name: "browser_search",
                    arguments: JSON.stringify({
                      query: "Try the search one more time",
                      queries: [
                        "top 5 ways REST APIs are used common use cases",
                        "REST API use cases examples applications",
                        "how are REST APIs commonly used real world",
                      ],
                    }),
                  },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        model: "kimi-k2.5",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Here are the top ways REST APIs are used in practice.",
            },
          },
        ],
      });
    const invokeTool = vi
      .fn<() => Promise<ToolInvokeResult>>()
      .mockResolvedValue({
        outcome: "executed",
        policyReason: "allowed",
        auditEventId: "audit-rest-queries-grounded-1",
        result: {
          query: "top 5 ways REST APIs are used common use cases",
          results: [
            { title: "What Is REST API? Examples, Uses & Challenges - Postman Blog", url: "https://blog.postman.com/rest-api-examples/", snippet: "Examples and common use cases." },
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
      sessionId: "sess-rest-queries-grounded-1",
      turnId: randomUUID(),
      userMessageId: "msg-rest-queries-grounded-1",
      content: "Try the search one more time",
      mode: "chat",
      providerId: "moonshot",
      model: "kimi-k2.5",
      webMode: "auto",
      memoryMode: "off",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      historyMessages: [
        { role: "user", content: "Can you look online and find the top 5 ways rest apis are used?" },
        {
          role: "assistant",
          content: "A source blocked automated browsing on blog.postman.com, so I'm falling back to the strongest leads I recovered so far.",
        },
        { role: "user", content: "Try the search one more time" },
      ],
    });

    expect(invokeTool).toHaveBeenCalledTimes(1);
    const kimiRetryCalls = invokeTool.mock.calls as unknown as Array<[{ args: Record<string, unknown> }]>;
    const kimiRetryCall = kimiRetryCalls[0]![0]!;
    expect(String(kimiRetryCall.args.query)).toMatch(/rest api/i);
    expect(String(kimiRetryCall.args.query)).not.toMatch(/one more time/i);
  });

  it("retries a blocked browser navigate against the next ranked search result in the same turn", async () => {
    const createChatCompletion = vi
      .fn<() => Promise<ChatCompletionResponse>>()
      .mockResolvedValueOnce(toolCallCompletion("top 5 ways REST APIs are used"))
      .mockResolvedValueOnce(navigateToolCallCompletion({ url: "https://blog.postman.com/rest-api-examples/" }))
      .mockResolvedValueOnce({
        model: "glm-5",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "REST APIs are commonly used for CRUD app backends, third-party integrations, mobile app services, workflow automation, and partner/public APIs.",
            },
          },
        ],
      });
    const invokeTool = vi
      .fn<() => Promise<ToolInvokeResult>>()
      .mockResolvedValueOnce({
        outcome: "executed",
        policyReason: "allowed",
        auditEventId: "audit-rest-search-1",
        result: {
          query: "top 5 ways REST APIs are used",
          results: [
            { title: "What Is REST API? Examples, Uses & Challenges - Postman Blog", url: "https://blog.postman.com/rest-api-examples/", snippet: "Examples and use cases." },
            { title: "How to Use REST API: Examples, Key Features, and Applications - ClickUp", url: "https://clickup.com/blog/rest-api-examples/", snippet: "Key features and real-world applications." },
          ],
        },
      })
      .mockResolvedValueOnce({
        outcome: "executed",
        policyReason: "allowed",
        auditEventId: "audit-rest-postman-blocked-1",
        result: {
          url: "https://blog.postman.com/rest-api-examples/",
          finalUrl: "https://blog.postman.com/rest-api-examples/",
          status: 403,
          title: "Just a moment...",
          textSnippet: "Sorry, you have been blocked. Cloudflare Ray ID.",
        },
      })
      .mockResolvedValueOnce({
        outcome: "executed",
        policyReason: "allowed",
        auditEventId: "audit-rest-clickup-1",
        result: {
          url: "https://clickup.com/blog/rest-api-examples/",
          finalUrl: "https://clickup.com/blog/rest-api-examples/",
          status: 200,
          title: "How to Use REST API: Examples, Key Features, and Applications - ClickUp",
          textSnippet: "REST APIs are used for integrations, automation, mobile and web backends, and partner systems.",
        },
      });
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(["browser.search", "browser.navigate"]),
      createChatCompletion,
      invokeTool,
    });

    const result = await orchestrator.run({
      sessionId: "sess-rest-blocked-retry-1",
      turnId: randomUUID(),
      userMessageId: "msg-rest-blocked-retry-1",
      content: "Can you look into the top 5 ways that a REST API can be used?",
      mode: "chat",
      providerId: "glm",
      model: "glm-5",
      webMode: "auto",
      memoryMode: "off",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      historyMessages: [{ role: "user", content: "Can you look into the top 5 ways that a REST API can be used?" }],
    });

    expect(invokeTool).toHaveBeenCalledTimes(3);
    const navigateRetryCalls = invokeTool.mock.calls as unknown as Array<[{ toolName: string; args: Record<string, unknown> }]>;
    const firstNavigateCall = navigateRetryCalls[1]![0]!;
    const secondNavigateCall = navigateRetryCalls[2]![0]!;
    expect(firstNavigateCall).toMatchObject({
      toolName: "browser.navigate",
      args: expect.objectContaining({
        url: "https://blog.postman.com/rest-api-examples/",
      }),
    });
    expect(secondNavigateCall).toMatchObject({
      toolName: "browser.navigate",
      args: expect.objectContaining({
        url: "https://clickup.com/blog/rest-api-examples/",
      }),
    });
    expect(result.assistantContent).toContain("REST APIs");
  });

  it("gives live-data browse turns enough time to synthesize after a successful navigate", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T18:33:34.000Z"));
    try {
      const createChatCompletion = vi
        .fn<() => Promise<ChatCompletionResponse>>()
        .mockImplementationOnce(async () => {
          vi.setSystemTime(new Date(Date.now() + 9000));
          return navigateToolCallCompletion({
            url: "https://www.techtarget.com/searchapparchitecture/tip/The-5-essential-HTTP-methods-in-RESTful-API-development",
          });
        })
        .mockImplementationOnce(async () => {
          vi.setSystemTime(new Date(Date.now() + 2000));
          return {
            model: "glm-5",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: "The top REST API uses are CRUD backends, third-party integrations, mobile app services, workflow automation, and partner-facing APIs.",
                },
              },
            ],
          };
        });
      const invokeTool = vi
        .fn<() => Promise<ToolInvokeResult>>()
        .mockImplementationOnce(async () => {
          vi.setSystemTime(new Date(Date.now() + 3000));
          return {
            outcome: "executed",
            policyReason: "allowed",
            auditEventId: "audit-rest-budget-search-1",
            result: {
              query: "top 5 ways REST APIs are used",
              results: [
                {
                  title: "What is a REST API? Examples, Use Cases, and Best Practices",
                  url: "https://www.browserstack.com/guide/rest-api",
                  snippet: "REST APIs are commonly used for integrations, CRUD backends, and automation.",
                },
                {
                  title: "The 5 essential HTTP methods in RESTful API development",
                  url: "https://www.techtarget.com/searchapparchitecture/tip/The-5-essential-HTTP-methods-in-RESTful-API-development",
                  snippet: "RESTful services use HTTP methods and commonly back web, mobile, and partner systems.",
                },
              ],
            },
          };
        })
        .mockImplementationOnce(async () => {
          vi.setSystemTime(new Date(Date.now() + 15000));
          return {
            outcome: "executed",
            policyReason: "allowed",
            auditEventId: "audit-rest-budget-navigate-1",
            result: {
              url: "https://www.techtarget.com/searchapparchitecture/tip/The-5-essential-HTTP-methods-in-RESTful-API-development",
              finalUrl: "https://www.techtarget.com/searchapparchitecture/tip/The-5-essential-HTTP-methods-in-RESTful-API-development",
              status: 200,
              title: "The 5 essential HTTP methods in RESTful API development | TechTarget",
              textSnippet: "REST APIs are widely used for web and mobile backends, app integrations, automation flows, and partner-facing services.",
            },
          };
        });
      const orchestrator = new ChatAgentOrchestrator({
        storage: createMockStorage() as never,
        listToolCatalog: () => createToolCatalog(["browser.search", "browser.navigate"]),
        createChatCompletion,
        invokeTool,
      });

      const result = await orchestrator.run({
        sessionId: "sess-rest-budget-extension-1",
        turnId: randomUUID(),
        userMessageId: "msg-rest-budget-extension-1",
        content: "Can you look online and find the top 5 ways rest apis are used?",
        mode: "chat",
        providerId: "glm",
        model: "glm-5",
        webMode: "auto",
        memoryMode: "off",
        thinkingLevel: "standard",
        toolAutonomy: "safe_auto",
        historyMessages: [{ role: "user", content: "Can you look online and find the top 5 ways rest apis are used?" }],
      });

      expect(result.assistantContent).toContain("top REST API uses");
      expect(result.turnTrace.failure).toBeUndefined();
      expect(createChatCompletion).toHaveBeenCalledTimes(2);
      expect(invokeTool).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("extends auto-mode budget when a non-live-data turn actually enters browser-backed execution", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T19:10:00.000Z"));
    try {
      const createChatCompletion = vi
        .fn<() => Promise<ChatCompletionResponse>>()
        .mockImplementationOnce(async () => {
          vi.setSystemTime(new Date(Date.now() + 9000));
          return toolCallCompletion("protobuf vs json schema tradeoffs for internal service contracts");
        })
        .mockImplementationOnce(async () => {
          vi.setSystemTime(new Date(Date.now() + 9000));
          return navigateToolCallCompletion({
            url: "https://example.com/protobuf-vs-json-schema",
          });
        })
        .mockImplementationOnce(async () => {
          vi.setSystemTime(new Date(Date.now() + 2000));
          return {
            model: "glm-5",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: "Protobuf is usually better for compact binary transport, while JSON Schema is stronger for JSON validation, interoperability, and contract tooling.",
                },
              },
            ],
          };
        });
      const invokeTool = vi
        .fn<() => Promise<ToolInvokeResult>>()
        .mockImplementationOnce(async () => {
          vi.setSystemTime(new Date(Date.now() + 3000));
          return {
            outcome: "executed",
            policyReason: "allowed",
            auditEventId: "audit-browser-extension-search-1",
            result: {
              query: "protobuf vs json schema tradeoffs for internal service contracts",
              results: [
                {
                  title: "Protobuf vs JSON Schema for service contracts",
                  url: "https://example.com/protobuf-vs-json-schema",
                  snippet: "Compares performance, interoperability, and validation tradeoffs.",
                },
              ],
            },
          };
        })
        .mockImplementationOnce(async () => {
          vi.setSystemTime(new Date(Date.now() + 15000));
          return {
            outcome: "executed",
            policyReason: "allowed",
            auditEventId: "audit-browser-extension-navigate-1",
            result: {
              url: "https://example.com/protobuf-vs-json-schema",
              finalUrl: "https://example.com/protobuf-vs-json-schema",
              status: 200,
              title: "Protobuf vs JSON Schema for service contracts",
              textSnippet: "Protobuf favors binary efficiency and typed contracts. JSON Schema favors human-readable JSON validation and broader ecosystem interoperability.",
            },
          };
        });
      const orchestrator = new ChatAgentOrchestrator({
        storage: createMockStorage() as never,
        listToolCatalog: () => createToolCatalog(["browser.search", "browser.navigate"]),
        createChatCompletion,
        invokeTool,
      });

      const result = await orchestrator.run({
        sessionId: "sess-browser-extension-1",
        turnId: randomUUID(),
        userMessageId: "msg-browser-extension-1",
        content: "Compare protobuf and JSON Schema tradeoffs for internal service contracts.",
        mode: "chat",
        providerId: "glm",
        model: "glm-5",
        webMode: "auto",
        memoryMode: "off",
        thinkingLevel: "standard",
        toolAutonomy: "safe_auto",
        historyMessages: [{ role: "user", content: "Compare protobuf and JSON Schema tradeoffs for internal service contracts." }],
      });

      expect(result.turnTrace.routing?.liveDataIntent).toBe(false);
      expect(result.assistantContent).toContain("Protobuf");
      expect(result.turnTrace.failure).toBeUndefined();
      expect(createChatCompletion).toHaveBeenCalledTimes(3);
      expect(invokeTool).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses fetched page content in the budget fallback after a successful navigate", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-13T00:00:00.000Z"));
    try {
      const createChatCompletion = vi
        .fn<() => Promise<ChatCompletionResponse>>()
        .mockImplementationOnce(async () => {
          vi.setSystemTime(new Date(Date.now() + 8000));
          return toolCallCompletion("help me leveling my skinning profession in world of warcraft midnight");
        })
        .mockImplementationOnce(async () => {
          vi.setSystemTime(new Date(Date.now() + 6000));
          return navigateToolCallCompletion({
            url: "https://www.wowhead.com/guide/midnight/professions/skinning-overview-trainer-locations-hides-tracking-tools",
          });
        })
        .mockImplementationOnce(async () => {
          vi.setSystemTime(new Date(Date.now() + 12000));
          return navigateToolCallCompletion({
            url: "https://www.wowhead.com/guide/midnight/professions/skinning-overview-trainer-locations-hides-tracking-tools#leveling",
          });
        });
      const invokeTool = vi
        .fn<() => Promise<ToolInvokeResult>>()
        .mockImplementationOnce(async () => {
          vi.setSystemTime(new Date(Date.now() + 3000));
          return {
            outcome: "executed",
            policyReason: "allowed",
            auditEventId: "audit-skinning-search-1",
            result: {
              query: "help me leveling my skinning profession in world of warcraft midnight",
              results: [
                {
                  title: "Midnight Skinning Profession Overview - Wowhead",
                  url: "https://www.wowhead.com/guide/midnight/professions/skinning-overview-trainer-locations-hides-tracking-tools",
                  snippet: "Skinning in WoW Midnight covers leveling, trainer locations, hides, tracking, and profession tools.",
                },
              ],
            },
          };
        })
        .mockImplementationOnce(async () => {
          vi.setSystemTime(new Date(Date.now() + 25000));
          return {
            outcome: "executed",
            policyReason: "allowed",
            auditEventId: "audit-skinning-navigate-1",
            result: {
              url: "https://www.wowhead.com/guide/midnight/professions/skinning-overview-trainer-locations-hides-tracking-tools",
              finalUrl: "https://www.wowhead.com/guide/midnight/professions/skinning-overview-trainer-locations-hides-tracking-tools",
              status: 200,
              title: "Midnight Skinning Profession Overview - Wowhead",
              textSnippet: [
                "Skinning in Midnight focuses on gathering leather and hides from beasts across the new zones.",
                "Leveling is primarily done by skinning beasts close to your current profession skill, then shifting to higher-rank creature families as recipes and drop ranks improve.",
                "Tracking, profession tools, and route selection matter because dense beast camps dramatically improve leveling speed.",
              ].join(" "),
            },
          };
        });
      const orchestrator = new ChatAgentOrchestrator({
        storage: createMockStorage() as never,
        listToolCatalog: () => createToolCatalog(["browser.search", "browser.navigate"]),
        createChatCompletion,
        invokeTool,
      });

      const result = await orchestrator.run({
        sessionId: "sess-skinning-budget-fallback-1",
        turnId: randomUUID(),
        userMessageId: "msg-skinning-budget-fallback-1",
        content: "Can you help me leveling my skinning profession in world of warcraft midnight?",
        mode: "chat",
        providerId: "glm",
        model: "glm-5",
        webMode: "auto",
        memoryMode: "off",
        thinkingLevel: "standard",
        toolAutonomy: "safe_auto",
        historyMessages: [{ role: "user", content: "Can you help me leveling my skinning profession in world of warcraft midnight?" }],
      });

      expect(result.turnTrace.failure?.failureClass).toBe("budget_exceeded");
      expect(result.assistantContent).toContain("Midnight Skinning Profession Overview - Wowhead");
      expect(result.assistantContent).toContain("Leveling is primarily done by skinning beasts close to your current profession skill");
      expect(result.assistantContent).not.toContain("strongest leads so far");
      expect(createChatCompletion).toHaveBeenCalledTimes(3);
      const completionCalls = createChatCompletion.mock.calls as unknown as Array<[ChatCompletionRequest]>;
      const thirdCompletionCall = completionCalls[2]?.[0];
      expect(thirdCompletionCall?.timeoutMs).toBe(28000);
      expect(invokeTool).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reuses duplicate explicit http.get calls for the same URL", async () => {
    const createChatCompletion = vi
      .fn<() => Promise<ChatCompletionResponse>>()
      .mockResolvedValueOnce(
        httpGetToolCallCompletion({
          url: "https://example.com/research",
        }),
      )
      .mockResolvedValueOnce(
        httpGetToolCallCompletion({
          url: "https://example.com/research",
        }),
      )
      .mockResolvedValueOnce({
        model: "glm-5",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Here is the synthesized answer.",
            },
          },
        ],
      });
    const invokeTool = vi
      .fn<() => Promise<ToolInvokeResult>>()
      .mockResolvedValueOnce({
        outcome: "executed",
        policyReason: "allowed",
        auditEventId: "audit-http-get-reuse-1",
        result: {
          url: "https://example.com/research",
          finalUrl: "https://example.com/research",
          status: 200,
          text: "Fetched content for reuse.",
        },
      });
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(["http.get"]),
      createChatCompletion,
      invokeTool,
    });

    const result = await orchestrator.run({
      sessionId: "sess-http-get-reuse-1",
      turnId: "turn-http-get-reuse-1",
      userMessageId: "msg-http-get-reuse-1",
      content: "Fetch the research URL again.",
      mode: "chat",
      providerId: "glm",
      model: "glm-5",
      webMode: "auto",
      memoryMode: "off",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      historyMessages: [{ role: "user", content: "Fetch the research URL again." }],
    });

    expect(result.turnTrace.failure).toBeUndefined();
    expect(result.assistantContent).toContain("Here is the synthesized answer.");
    expect(invokeTool).toHaveBeenCalledTimes(1);
    const toolRuns = result.turnTrace.toolRuns;
    expect(toolRuns).toHaveLength(2);
    expect(toolRuns[0]?.toolName).toBe("http.get");
    expect(toolRuns[1]?.toolName).toBe("http.get");
    expect(toolRuns[1]?.result).toMatchObject({
      reusedResult: true,
      reusedPriorToolRunId: toolRuns[0]?.toolRunId,
    });
  });

  it("does not reuse duplicate browser.navigate calls because browser state may have changed", async () => {
    const createChatCompletion = vi
      .fn<() => Promise<ChatCompletionResponse>>()
      .mockResolvedValueOnce(
        navigateToolCallCompletion({
          url: "https://example.com/research",
        }),
      )
      .mockResolvedValueOnce(
        navigateToolCallCompletion({
          url: "https://example.com/research",
        }),
      )
      .mockResolvedValueOnce({
        model: "glm-5",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Done.",
            },
          },
        ],
      });
    const invokeTool = vi
      .fn<() => Promise<ToolInvokeResult>>()
      .mockResolvedValue({
        outcome: "executed",
        policyReason: "allowed",
        auditEventId: "audit-nav-no-reuse",
        result: {
          url: "https://example.com/research",
          finalUrl: "https://example.com/research",
          status: 200,
          title: "Example research",
          textSnippet: "Example content",
        },
      });
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(["browser.navigate"]),
      createChatCompletion,
      invokeTool,
    });

    const result = await orchestrator.run({
      sessionId: "sess-nav-no-reuse-1",
      turnId: "turn-nav-no-reuse-1",
      userMessageId: "msg-nav-no-reuse-1",
      content: "Open the same research page twice.",
      mode: "chat",
      providerId: "glm",
      model: "glm-5",
      webMode: "auto",
      memoryMode: "off",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      historyMessages: [{ role: "user", content: "Open the same research page twice." }],
    });

    expect(result.turnTrace.failure).toBeUndefined();
    expect(invokeTool).toHaveBeenCalledTimes(2);
    expect(result.turnTrace.toolRuns.every((run) => run.result?.reusedResult !== true)).toBe(true);
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

  it("preserves streamed text parts when later chunks use nested text.value content", async () => {
    const createChatCompletion = vi.fn<() => Promise<ChatCompletionResponse>>();
    const createChatCompletionStream = vi.fn(async function* () {
      yield {
        id: "chunk_1",
        model: "glm-5",
        choices: [
          {
            index: 0,
            delta: {
              content: "I'd be happy to help you find weekend activities! Since it's currently Wednesday, March 11th, you're asking about the upcoming weekend (March 14-15, 2026).\n\nTo give you the best recommendations, I",
            },
          },
        ],
      };
      yield {
        id: "chunk_2",
        model: "glm-5",
        usage: {
          prompt_tokens: 1140,
          completion_tokens: 191,
        },
        choices: [
          {
            index: 0,
            delta: {
              content: [
                { type: "output_text", text: { value: " need a bit more information about your location and interests before I suggest specific plans." } },
              ],
            },
          },
        ],
      };
    });
    const invokeTool = vi.fn<() => Promise<ToolInvokeResult>>();
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog([]),
      createChatCompletion,
      createChatCompletionStream,
      invokeTool,
    });

    const result = await orchestrator.run({
      sessionId: "sess-streamed-parts-1",
      turnId: randomUUID(),
      userMessageId: "msg-streamed-parts-1",
      content: "Help me plan something fun.",
      mode: "chat",
      providerId: "glm",
      model: "glm-5",
      webMode: "auto",
      memoryMode: "off",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      historyMessages: [{ role: "user", content: "Help me plan something fun." }],
    });

    expect(createChatCompletionStream).toHaveBeenCalledTimes(1);
    expect(createChatCompletion).not.toHaveBeenCalled();
    expect(result.assistantContent).toContain("To give you the best recommendations, I need a bit more information");
    expect(result.assistantContent).toContain("location and interests");
  });

  it("caps the synthesis fallback LLM timeout instead of using the default 60s", async () => {
    let capturedTimeoutMs: number | undefined;
    const createChatCompletion = vi
      .fn<(request: ChatCompletionRequest) => Promise<ChatCompletionResponse>>()
      .mockImplementation(async (request: ChatCompletionRequest) => {
        capturedTimeoutMs = request.timeoutMs;
        return {
          model: "glm-5",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: "Synthesized answer from tool output.",
              },
            },
          ],
        };
      });
    const invokeTool = vi.fn<() => Promise<ToolInvokeResult>>().mockResolvedValue({
      outcome: "executed",
      policyReason: "allowed",
      auditEventId: "audit-synthesis-timeout-1",
      result: {
        results: [{ title: "Result", url: "https://example.com/synth" }],
      },
    });
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(["browser.search"]),
      createChatCompletion,
      invokeTool,
    });

    await orchestrator.run({
      sessionId: "sess-synth-timeout-1",
      turnId: randomUUID(),
      userMessageId: "msg-synth-timeout-1",
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

    // The synthesis call (last createChatCompletion call) should have a bounded timeout.
    // If only the main loop ran (no synthesis), capturedTimeoutMs comes from the main loop.
    // Either way, verify it's not the default 60s.
    expect(capturedTimeoutMs).toBeDefined();
    expect(capturedTimeoutMs).toBeLessThanOrEqual(28000);
  });

  it("stops alternate-URL retries when the turn budget expires mid-fallback", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T20:00:00.000Z"));
    try {
      let navigateCallCount = 0;
      const createChatCompletion = vi
        .fn<() => Promise<ChatCompletionResponse>>()
        .mockImplementation(async () => {
          vi.setSystemTime(new Date(Date.now() + 5000));
          return navigateToolCallCompletion({
            url: "https://blocked-site.com/article",
          });
        });
      const invokeTool = vi
        .fn<() => Promise<ToolInvokeResult>>()
        .mockImplementationOnce(async () => {
          vi.setSystemTime(new Date(Date.now() + 2000));
          return {
            outcome: "executed",
            policyReason: "allowed",
            auditEventId: "audit-budget-search",
            result: {
              results: [
                { title: "Site A", url: "https://blocked-site.com/article", snippet: "news" },
                { title: "Site B", url: "https://alt1.com/article", snippet: "more news" },
                { title: "Site C", url: "https://alt2.com/article", snippet: "even more" },
              ],
            },
          };
        })
        .mockImplementation(async () => {
          navigateCallCount += 1;
          // Each navigate takes 20s, eating deep into budget.
          vi.setSystemTime(new Date(Date.now() + 20000));
          return {
            outcome: "executed",
            policyReason: "allowed",
            auditEventId: `audit-budget-nav-${navigateCallCount}`,
            result: {
              url: "https://blocked-site.com/article",
              finalUrl: "https://blocked-site.com/article",
              status: 403,
              title: "Blocked",
              textSnippet: "Sorry, you have been blocked. Cloudflare Ray ID.",
            },
          };
        });
      const orchestrator = new ChatAgentOrchestrator({
        storage: createMockStorage() as never,
        listToolCatalog: () => createToolCatalog(["browser.search", "browser.navigate"]),
        createChatCompletion,
        invokeTool,
      });

      const result = await orchestrator.run({
        sessionId: "sess-budget-alt-retry-1",
        turnId: randomUUID(),
        userMessageId: "msg-budget-alt-retry-1",
        content: "What's the latest news today?",
        mode: "chat",
        providerId: "glm",
        model: "glm-5",
        webMode: "auto",
        memoryMode: "off",
        thinkingLevel: "standard",
        toolAutonomy: "safe_auto",
        historyMessages: [{ role: "user", content: "What's the latest news today?" }],
      });

      // The alternate retry loop should NOT try all 3 URLs (2 alternates) since
      // the budget deadline is hit. We expect fewer navigate calls than the
      // maximum possible (1 original + 2 alternates = 3 total).
      const totalNavigateCalls = (invokeTool.mock.calls as unknown as Array<[{ toolName: string }]>).filter(
        (call) => call[0].toolName === "browser.navigate",
      ).length;
      // At least 1 navigate was attempted (the original), but not all 3.
      expect(totalNavigateCalls).toBeLessThan(3);
      expect(result.turnTrace.status).not.toBe("running");
    } finally {
      vi.useRealTimers();
    }
  });

  it("poisons hosts from fallback chain entries in executed runs recovered via MCP", async () => {
    const createChatCompletion = vi
      .fn<() => Promise<ChatCompletionResponse>>()
      .mockResolvedValueOnce(navigateToolCallCompletion({ url: "https://blocked-host.com/page2" }))
      .mockResolvedValueOnce({
        model: "glm-5",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Here is what I found.",
            },
          },
        ],
      });
    const invokeTool = vi
      .fn<() => Promise<ToolInvokeResult>>()
      .mockResolvedValueOnce({
        outcome: "executed",
        policyReason: "allowed",
        auditEventId: "audit-poison-search",
        result: {
          results: [
            { title: "Good article", url: "https://blocked-host.com/page1", snippet: "news" },
            { title: "Backup article", url: "https://blocked-host.com/page2", snippet: "more" },
            { title: "Clean article", url: "https://clean-host.com/page1", snippet: "other" },
          ],
        },
      })
      .mockResolvedValueOnce({
        outcome: "executed",
        policyReason: "allowed",
        auditEventId: "audit-poison-navigate",
        result: {
          url: "https://blocked-host.com/page1",
          finalUrl: "https://blocked-host.com/page1",
          status: 403,
          title: "Blocked",
          textSnippet: "Sorry, you have been blocked. Cloudflare Ray ID.",
          // Simulates a run that was classified as blocked but recovered via MCP fallback.
          // After recovery the run status is "executed" but the fallback chain records the block.
          fallbackChain: [
            {
              toolName: "browser.navigate",
              engineTier: "builtin",
              engineLabel: "Built-in browser",
              status: "failed",
              browserFailureClass: "remote_blocked",
              url: "https://blocked-host.com/page1",
              finalUrl: "https://blocked-host.com/page1",
            },
            {
              toolName: "mcp_navigate",
              engineTier: "premium",
              engineLabel: "Premium browser",
              status: "executed",
              url: "https://blocked-host.com/page1",
              finalUrl: "https://blocked-host.com/page1",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        outcome: "executed",
        policyReason: "allowed",
        auditEventId: "audit-poison-navigate-2",
        result: {
          url: "https://clean-host.com/page1",
          finalUrl: "https://clean-host.com/page1",
          status: 200,
          title: "Clean article",
          textSnippet: "This article has useful content about the topic.",
        },
      });
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(["browser.search", "browser.navigate"]),
      createChatCompletion,
      invokeTool,
    });

    const result = await orchestrator.run({
      sessionId: "sess-poison-chain-1",
      turnId: randomUUID(),
      userMessageId: "msg-poison-chain-1",
      content: "What's the latest news today?",
      mode: "chat",
      providerId: "glm",
      model: "glm-5",
      webMode: "auto",
      memoryMode: "off",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      historyMessages: [{ role: "user", content: "What's the latest news today?" }],
    });

    // The second navigate call should NOT use blocked-host.com/page2 because
    // blocked-host.com should be poisoned from the fallback chain of the first navigate.
    // It should instead use clean-host.com.
    const navigateCalls = (invokeTool.mock.calls as unknown as Array<[{ toolName: string; args: Record<string, unknown> }]>)
      .map((call) => call[0])
      .filter((arg) => arg.toolName === "browser.navigate");
    if (navigateCalls.length >= 2) {
      expect(String(navigateCalls[1]!.args.url)).not.toContain("blocked-host.com");
    }
    expect(result.turnTrace.status).not.toBe("running");
  });

  it("passes abort signal to main loop LLM completion calls", async () => {
    const controller = new AbortController();
    const createChatCompletion = vi
      .fn<(request: ChatCompletionRequest) => Promise<ChatCompletionResponse>>()
      .mockImplementation(async (request) => {
        // Capture the signal from the first completion request, then abort.
        if (request.signal) {
          controller.abort();
        }
        // Simulate an abort error since the signal is now aborted.
        if (request.signal?.aborted) {
          const err = new Error("aborted");
          err.name = "AbortError";
          throw err;
        }
        return {
          model: "glm-5",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "Final answer" },
            },
          ],
        };
      });
    const invokeTool = vi.fn<() => Promise<ToolInvokeResult>>().mockResolvedValue({
      outcome: "executed",
      policyReason: "allowed",
      auditEventId: "audit-signal-1",
      result: { results: [{ title: "R", url: "https://example.com" }] },
    });
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(),
      createChatCompletion,
      invokeTool,
    });

    const result = await orchestrator.run({
      sessionId: "sess-signal-1",
      turnId: randomUUID(),
      userMessageId: "msg-signal-1",
      content: "Find AI references",
      mode: "chat",
      providerId: "glm",
      model: "glm-5",
      webMode: "auto",
      memoryMode: "off",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      historyMessages: [{ role: "user", content: "Find AI references" }],
      signal: controller.signal,
    });

    // The completion was called with the signal present.
    expect(createChatCompletion.mock.calls.length).toBeGreaterThanOrEqual(1);
    const firstCall = createChatCompletion.mock.calls[0]?.[0] as ChatCompletionRequest | undefined;
    expect(firstCall?.signal).toBe(controller.signal);
    // Turn should be cancelled since the signal was aborted.
    expect(result.turnTrace.status).toBe("cancelled");
  });

  it("continues MCP fallback tiers when one tier throws instead of returning", async () => {
    let mcpInvokeCallCount = 0;
    const createChatCompletion = vi
      .fn<() => Promise<ChatCompletionResponse>>()
      .mockResolvedValueOnce(navigateToolCallCompletion({ url: "https://blocked-site.com/page" }))
      .mockResolvedValue({
        model: "glm-5",
        choices: [{ index: 0, message: { role: "assistant", content: "Here is the answer." } }],
      });
    const invokeTool = vi
      .fn<() => Promise<ToolInvokeResult>>()
      .mockResolvedValueOnce({
        outcome: "executed",
        policyReason: "allowed",
        auditEventId: "audit-mcp-throw-search",
        result: {
          results: [
            { title: "Article", url: "https://blocked-site.com/page", snippet: "news" },
          ],
        },
      })
      .mockResolvedValue({
        outcome: "executed",
        policyReason: "allowed",
        auditEventId: "audit-mcp-throw-nav",
        result: {
          url: "https://blocked-site.com/page",
          finalUrl: "https://blocked-site.com/page",
          status: 403,
          title: "Blocked",
          textSnippet: "Sorry, you have been blocked. Cloudflare Ray ID.",
        },
      });
    const invokeMcpTool = vi
      .fn<(request: McpInvokeRequest) => Promise<McpInvokeResponse>>()
      .mockImplementation(async () => {
        mcpInvokeCallCount += 1;
        if (mcpInvokeCallCount === 1) {
          throw new Error("MCP server removed unexpectedly.");
        }
        return {
          ok: true,
          output: {
            contentText: "This is the article content from the second MCP tier.",
          },
        };
      });
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(["browser.search", "browser.navigate"]),
      createChatCompletion,
      invokeTool,
      invokeMcpTool,
      listMcpBrowserFallbackTargets: () => [
        { serverId: "srv-broken", label: "Broken MCP", tier: "playwright_mcp" as const, navigateToolName: "mcp_navigate" },
        { serverId: "srv-good", label: "Good MCP", tier: "browser_mcp" as const, navigateToolName: "mcp_navigate" },
      ],
    });

    const result = await orchestrator.run({
      sessionId: "sess-mcp-throw-1",
      turnId: randomUUID(),
      userMessageId: "msg-mcp-throw-1",
      content: "What's the latest news today?",
      mode: "chat",
      providerId: "glm",
      model: "glm-5",
      webMode: "auto",
      memoryMode: "off",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      historyMessages: [{ role: "user", content: "What's the latest news today?" }],
    });

    // Both MCP tiers should be attempted: first throws, second succeeds.
    expect(mcpInvokeCallCount).toBe(2);
    expect(result.turnTrace.status).not.toBe("running");
  });

  it("stops alternate-URL retries when abort signal fires mid-fallback", async () => {
    const controller = new AbortController();
    let navigateCallCount = 0;
    const createChatCompletion = vi
      .fn<() => Promise<ChatCompletionResponse>>()
      .mockResolvedValueOnce(navigateToolCallCompletion({ url: "https://site-a.com/page" }))
      .mockResolvedValue({
        model: "glm-5",
        choices: [{ index: 0, message: { role: "assistant", content: "Done." } }],
      });
    const invokeTool = vi
      .fn<() => Promise<ToolInvokeResult>>()
      // Pre-loop synthetic search with alternate URLs.
      .mockResolvedValueOnce({
        outcome: "executed",
        policyReason: "allowed",
        auditEventId: "audit-abort-search",
        result: {
          results: [
            { title: "Site A", url: "https://site-a.com/page", snippet: "news" },
            { title: "Site B", url: "https://alt-b.com/page", snippet: "more" },
            { title: "Site C", url: "https://alt-c.com/page", snippet: "even more" },
          ],
        },
      })
      .mockImplementation(async () => {
        navigateCallCount += 1;
        // After first navigate attempt, fire the abort signal.
        if (navigateCallCount >= 1) {
          controller.abort();
        }
        return {
          outcome: "executed",
          policyReason: "allowed",
          auditEventId: `audit-abort-nav-${navigateCallCount}`,
          result: {
            url: "https://site-a.com/page",
            finalUrl: "https://site-a.com/page",
            status: 403,
            title: "Blocked",
            textSnippet: "Sorry, you have been blocked. Cloudflare Ray ID.",
          },
        };
      });
    const orchestrator = new ChatAgentOrchestrator({
      storage: createMockStorage() as never,
      listToolCatalog: () => createToolCatalog(["browser.search", "browser.navigate"]),
      createChatCompletion,
      invokeTool,
    });

    const result = await orchestrator.run({
      sessionId: "sess-abort-alt-1",
      turnId: randomUUID(),
      userMessageId: "msg-abort-alt-1",
      content: "What's the latest news today?",
      mode: "chat",
      providerId: "glm",
      model: "glm-5",
      webMode: "auto",
      memoryMode: "off",
      thinkingLevel: "standard",
      toolAutonomy: "safe_auto",
      historyMessages: [{ role: "user", content: "What's the latest news today?" }],
      signal: controller.signal,
    });

    // Abort should stop the alternate retry loop. We expect at most 2 navigate
    // calls (original + at most 1 alternate before signal fires) instead of 3.
    const totalNavigateCalls = (invokeTool.mock.calls as unknown as Array<[{ toolName: string }]>).filter(
      (call) => call[0].toolName === "browser.navigate",
    ).length;
    expect(totalNavigateCalls).toBeLessThanOrEqual(2);
    expect(result.turnTrace.status).toBe("cancelled");
  });
});
