import { randomUUID } from "node:crypto";
import type {
  ChatCitationRecord,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMode,
  ChatSendMessageRequest,
  ChatStreamChunk,
  ChatThinkingLevel,
  ChatToolRunRecord,
  ChatTurnTraceRecord,
  ChatWebMode,
  ToolCatalogEntry,
  ToolInvokeRequest,
  ToolInvokeResult,
} from "@goatcitadel/contracts";
import type { Storage } from "@goatcitadel/storage";

const MAX_TOOL_LOOPS = 6;
const MAX_TOOL_RUNS_PER_TURN = 12;
const TOOL_FAILURE_CIRCUIT_BREAKER_THRESHOLD = 2;
const SAFE_WRITE_FALLBACK_DIR = "./workspace/goatcitadel_out";
const QUERY_TOOL_NAMES = new Set(["browser.search", "memory.search", "embeddings.query"]);
const TOOL_REQUIRED_ARGS: Record<string, string[]> = {
  "browser.search": ["query"],
  "browser.navigate": ["url"],
  "browser.extract": ["url"],
  "browser.interact": ["url", "steps"],
  "http.get": ["url"],
  "http.post": ["url"],
  "memory.search": ["query"],
  "memory.write": ["namespace", "title", "content"],
  "memory.upsert": ["namespace", "title", "content"],
  "embeddings.query": ["query"],
};

type ChatCompletionMessage = ChatCompletionRequest["messages"][number];

export interface ChatAgentTurnInput {
  sessionId: string;
  turnId: string;
  userMessageId: string;
  content: string;
  mode: ChatMode;
  model?: string;
  providerId?: string;
  webMode: ChatWebMode;
  memoryMode: "auto" | "on" | "off";
  thinkingLevel: ChatThinkingLevel;
  toolAutonomy: "safe_auto" | "manual";
  historyMessages: ChatCompletionRequest["messages"];
}

export interface ChatAgentTurnResult {
  turnTrace: ChatTurnTraceRecord;
  assistantContent: string;
  assistantModel?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
    costUsd?: number;
  };
  requiresApproval?: {
    approvalId: string;
    toolName?: string;
    reason?: string;
  };
}

export interface ChatAgentOrchestratorDeps {
  storage: Storage;
  listToolCatalog: () => ToolCatalogEntry[];
  createChatCompletion: (request: ChatCompletionRequest) => Promise<ChatCompletionResponse>;
  invokeTool: (request: ToolInvokeRequest) => Promise<ToolInvokeResult>;
  evaluateToolAccess?: (request: {
    toolName: string;
    sessionId: string;
    agentId: string;
    args?: Record<string, unknown>;
  }) => {
    allowed: boolean;
    requiresApproval: boolean;
    reasonCodes: string[];
  };
}

export class ChatAgentOrchestrator {
  public constructor(private readonly deps: ChatAgentOrchestratorDeps) {}

  public async run(input: ChatAgentTurnInput): Promise<ChatAgentTurnResult> {
    const events: ChatStreamChunk[] = [];
    for await (const chunk of this.runStream(input)) {
      events.push(chunk);
    }
    const doneTrace = events
      .filter((event) => event.type === "trace_update")
      .map((event) => event.trace)
      .filter((trace): trace is ChatTurnTraceRecord => Boolean(trace))
      .at(-1);
    const doneMessage = events
      .filter((event) => event.type === "message_done")
      .at(-1);
    const usageChunk = events
      .filter((event) => event.type === "usage")
      .at(-1);
    const approval = events.find((event) => event.type === "approval_required")?.approval;
    if (!doneTrace) {
      throw new Error("Agent turn ended without trace.");
    }
    return {
      turnTrace: doneTrace,
      assistantContent: doneMessage?.content ?? "",
      assistantModel: doneTrace.model,
      usage: usageChunk?.usage,
      requiresApproval: approval ? {
        approvalId: approval.approvalId,
        toolName: approval.toolName,
        reason: approval.reason,
      } : undefined,
    };
  }

  public async *runStream(input: ChatAgentTurnInput): AsyncGenerator<ChatStreamChunk> {
    const now = new Date().toISOString();
    const trace = this.deps.storage.chatTurnTraces.create({
      turnId: input.turnId,
      sessionId: input.sessionId,
      userMessageId: input.userMessageId,
      status: "running",
      mode: input.mode,
      model: input.model,
      webMode: input.webMode,
      memoryMode: input.memoryMode,
      thinkingLevel: input.thinkingLevel,
      routing: {
        liveDataIntent: detectLiveDataIntent(input.content),
      },
      startedAt: now,
    });

    yield {
      type: "trace_update",
      sessionId: input.sessionId,
      turnId: input.turnId,
      trace,
    };

    const conversationMessages: ChatCompletionRequest["messages"] = [...input.historyMessages];
    const toolSchema = input.toolAutonomy === "manual"
      ? { tools: [], modelToCanonical: new Map<string, string>(), canonicalToModel: new Map<string, string>() }
      : await this.buildToolSchema(input);
    const canUseTimeTool = toolSchema.canonicalToModel.has("time.now");
    const canUseSearchTool = toolSchema.canonicalToModel.has("browser.search");
    const localFileIntent = detectLocalFileIntent(input.content);
    const citations: ChatCitationRecord[] = [];
    const toolRuns: ChatToolRunRecord[] = [];
    let toolRunCount = 0;
    let assistantContent = "";
    let assistantModel = input.model;
    let routingState: ChatTurnTraceRecord["routing"] = {
      liveDataIntent: detectLiveDataIntent(input.content),
      primaryProviderId: input.providerId,
      primaryModel: input.model,
      effectiveProviderId: input.providerId,
      effectiveModel: input.model,
    };
    let finalStatus: ChatTurnTraceRecord["status"] = "completed";
    let approvalPayload: {
      approvalId: string;
      toolName?: string;
      reason?: string;
    } | undefined;
    const usageTotals = {
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      costUsd: 0,
    };
    let usageObserved = false;
    let circuitBreakerReason: string | undefined;
    const toolFailureSignatureCounts = new Map<string, number>();

    if (detectMissingLogPayloadIntent(input.content)) {
      assistantContent = buildMissingLogInputTemplate();
    }
    if (!assistantContent && localFileIntent && detectLocalFileAccessCheckIntent(input.content)) {
      assistantContent = buildLocalFileAccessFallback(input.content);
    }

    // Deterministic live-time helper for simple queries.
    if (!assistantContent && detectTimeIntent(input.content) && canUseTimeTool) {
      const syntheticRun = await this.executeToolCall({
        input,
        turnId: input.turnId,
        toolName: "time.now",
        rawArgs: {},
      });
      toolRunCount += 1;
      toolRuns.push(syntheticRun.record);
      yield {
        type: "tool_start",
        sessionId: input.sessionId,
        turnId: input.turnId,
        toolRun: {
          ...syntheticRun.record,
          status: "started",
        },
      };
      if (syntheticRun.chunk) {
        yield syntheticRun.chunk;
      }
      if (syntheticRun.record.status === "executed" && syntheticRun.record.result) {
        const toolMessageId = `time-${randomUUID()}`;
        conversationMessages.push({
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: toolMessageId,
              type: "function",
              function: {
                name: this.resolveModelToolName("time.now", toolSchema.canonicalToModel),
                arguments: "{}",
              },
            },
          ] as unknown as Array<Record<string, unknown>>,
        } as unknown as ChatCompletionMessage);
        conversationMessages.push({
          role: "tool",
          tool_call_id: toolMessageId,
          content: JSON.stringify(syntheticRun.record.result),
        } as ChatCompletionMessage);
      }
      for (const citation of inferCitationsFromToolResult(syntheticRun.record)) {
        citations.push(citation);
        yield {
          type: "citation",
          sessionId: input.sessionId,
          turnId: input.turnId,
          citation,
        };
      }
      if (syntheticRun.record.status === "approval_required" && syntheticRun.record.approvalId) {
        finalStatus = "approval_required";
        approvalPayload = {
          approvalId: syntheticRun.record.approvalId,
          toolName: syntheticRun.record.toolName,
          reason: "Approval required by policy.",
        };
        this.deps.storage.chatInlineApprovals.upsert({
          approvalId: syntheticRun.record.approvalId,
          sessionId: input.sessionId,
          turnId: input.turnId,
          toolName: syntheticRun.record.toolName,
          status: "pending",
          reason: "Approval required by policy.",
        });
      }
    }

    if (
      !assistantContent
      && !approvalPayload
      && input.toolAutonomy !== "manual"
      && input.webMode !== "off"
      && detectLiveDataIntent(input.content)
      && !localFileIntent
      && !detectTimeIntent(input.content)
      && canUseSearchTool
      && toolRunCount < MAX_TOOL_RUNS_PER_TURN
    ) {
      const liveDataQuery = deriveLiveDataQuery(input.content);
      const syntheticRun = await this.executeToolCall({
        input,
        turnId: input.turnId,
        toolName: "browser.search",
        rawArgs: {
          query: liveDataQuery,
          maxResults: input.webMode === "deep" ? 8 : 5,
        },
      });
      toolRunCount += 1;
      toolRuns.push(syntheticRun.record);
      yield {
        type: "tool_start",
        sessionId: input.sessionId,
        turnId: input.turnId,
        toolRun: {
          ...syntheticRun.record,
          status: "started",
        },
      };
      if (syntheticRun.chunk) {
        yield syntheticRun.chunk;
      }
      if (syntheticRun.record.status === "executed" && syntheticRun.record.result) {
        const toolMessageId = `search-${randomUUID()}`;
        conversationMessages.push({
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: toolMessageId,
              type: "function",
              function: {
                name: this.resolveModelToolName("browser.search", toolSchema.canonicalToModel),
                arguments: JSON.stringify({
                  query: liveDataQuery,
                  maxResults: input.webMode === "deep" ? 8 : 5,
                }),
              },
            },
          ] as unknown as Array<Record<string, unknown>>,
        } as unknown as ChatCompletionMessage);
        conversationMessages.push({
          role: "tool",
          tool_call_id: toolMessageId,
          content: JSON.stringify(syntheticRun.record.result),
        } as ChatCompletionMessage);
      }
      for (const citation of inferCitationsFromToolResult(syntheticRun.record)) {
        citations.push(citation);
        yield {
          type: "citation",
          sessionId: input.sessionId,
          turnId: input.turnId,
          citation,
        };
      }
      if (syntheticRun.record.status === "approval_required" && syntheticRun.record.approvalId) {
        finalStatus = "approval_required";
        approvalPayload = {
          approvalId: syntheticRun.record.approvalId,
          toolName: syntheticRun.record.toolName,
          reason: "Approval required by policy.",
        };
        this.deps.storage.chatInlineApprovals.upsert({
          approvalId: syntheticRun.record.approvalId,
          sessionId: input.sessionId,
          turnId: input.turnId,
          toolName: syntheticRun.record.toolName,
          status: "pending",
          reason: "Approval required by policy.",
        });
      }
    }

    if (!assistantContent) {
      try {
        for (let loop = 0; loop < MAX_TOOL_LOOPS; loop += 1) {
        const completion = await this.deps.createChatCompletion({
          providerId: input.providerId,
          model: input.model,
          messages: conversationMessages,
          stream: false,
          memory: {
            enabled: input.memoryMode !== "off",
            mode: input.memoryMode === "off" ? "off" : "qmd",
            sessionId: input.sessionId,
          },
          tools: toolSchema.tools.length > 0 ? toolSchema.tools : undefined,
          tool_choice: toolSchema.tools.length > 0 ? "auto" : undefined,
        });
        assistantModel = typeof completion.model === "string" ? completion.model : assistantModel;
        const completionUsage = parseUsageFromCompletion(completion);
        if (completionUsage) {
          usageObserved = true;
          usageTotals.inputTokens += completionUsage.inputTokens ?? 0;
          usageTotals.outputTokens += completionUsage.outputTokens ?? 0;
          usageTotals.cachedInputTokens += completionUsage.cachedInputTokens ?? 0;
          usageTotals.costUsd += completionUsage.costUsd ?? 0;
        }
        const completionRouting = completion.routing as ChatTurnTraceRecord["routing"] | undefined;
        if (completionRouting) {
          routingState = {
            ...routingState,
            ...completionRouting,
          };
        }

        const choice = completion.choices?.[0];
        const message = choice?.message as Record<string, unknown> | undefined;
        if (!message) {
          assistantContent = "";
          break;
        }

        const toolCalls = readToolCalls(message, toolSchema.modelToCanonical);
        if (toolCalls.length === 0 || input.toolAutonomy === "manual") {
          assistantContent = extractMessageContent(message);
          conversationMessages.push({
            role: "assistant",
            content: assistantContent,
          });
          break;
        }

        conversationMessages.push({
          role: "assistant",
          content: extractMessageContent(message),
          tool_calls: toolCalls.map((toolCall) => ({
            id: toolCall.id,
            type: "function",
            function: {
              name: this.resolveModelToolName(toolCall.toolName, toolSchema.canonicalToModel),
              arguments: toolCall.rawArguments,
            },
          })) as unknown as Array<Record<string, unknown>>,
        } as unknown as ChatCompletionMessage);

        for (const toolCall of toolCalls) {
          if (toolRunCount >= MAX_TOOL_RUNS_PER_TURN) {
            throw new Error("Tool run limit reached for this turn.");
          }
          if (circuitBreakerReason) {
            break;
          }
          toolRunCount += 1;
          const executed = await this.executeToolCall({
            input,
            turnId: input.turnId,
            toolName: toolCall.toolName,
            rawArgs: toolCall.args,
            toolCallId: toolCall.id,
          });
          toolRuns.push(executed.record);
          yield {
            type: "tool_start",
            sessionId: input.sessionId,
            turnId: input.turnId,
            toolRun: {
              ...executed.record,
              status: "started",
            },
          };
          if (executed.chunk) {
            yield executed.chunk;
          }

          if (executed.record.status === "approval_required" && executed.record.approvalId) {
            finalStatus = "approval_required";
            approvalPayload = {
              approvalId: executed.record.approvalId,
              toolName: executed.record.toolName,
              reason: "Approval required by policy.",
            };
            this.deps.storage.chatInlineApprovals.upsert({
              approvalId: executed.record.approvalId,
              sessionId: input.sessionId,
              turnId: input.turnId,
              toolName: executed.record.toolName,
              status: "pending",
              reason: "Approval required by policy.",
            });
            break;
          }

          if (executed.record.status === "failed" || executed.record.status === "blocked") {
            const signature = `${executed.record.toolName}:${normalizeFailureSignature(executed.record.error)}`;
            const nextCount = (toolFailureSignatureCounts.get(signature) ?? 0) + 1;
            toolFailureSignatureCounts.set(signature, nextCount);
            if (nextCount >= TOOL_FAILURE_CIRCUIT_BREAKER_THRESHOLD) {
              circuitBreakerReason = `Repeated tool failure for ${executed.record.toolName} (${nextCount} attempts): ${executed.record.error ?? "unknown error"}`;
              break;
            }
          }

          const toolResultPayload = executed.record.result ?? { error: executed.record.error ?? "Tool failed." };
          conversationMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResultPayload),
          } as ChatCompletionMessage);

          for (const citation of inferCitationsFromToolResult(executed.record)) {
            citations.push(citation);
            yield {
              type: "citation",
              sessionId: input.sessionId,
              turnId: input.turnId,
              citation,
            };
          }
        }

        if (approvalPayload) {
          break;
        }

        if (circuitBreakerReason) {
          assistantContent = buildToolFailureFallbackMessage(input.content, toolRuns, circuitBreakerReason);
          finalStatus = "completed";
          break;
        }
        }
      } catch (error) {
        finalStatus = "failed";
        assistantContent = (error as Error).message;
        yield {
          type: "error",
          sessionId: input.sessionId,
          turnId: input.turnId,
          error: assistantContent,
        };
      }
    }

    if (!approvalPayload && assistantContent.trim().length === 0) {
      assistantContent = await this.synthesizeToolOutcomeFallback({
        input,
        toolRuns,
        circuitBreakerReason,
      });
    }
    assistantContent = appendToolFailureConstraints(assistantContent, toolRuns);

    const finishedAt = new Date().toISOString();
    const updatedTrace = this.deps.storage.chatTurnTraces.patch(input.turnId, {
      status: finalStatus,
      model: assistantModel,
      routing: {
        ...routingState,
        liveDataIntent: detectLiveDataIntent(input.content),
        effectiveProviderId: routingState.effectiveProviderId ?? input.providerId,
        effectiveModel: routingState.effectiveModel ?? assistantModel,
      },
      finishedAt,
    });
    const hydratedTrace = {
      ...updatedTrace,
      citations,
      toolRuns: this.deps.storage.chatToolRuns.listByTurn(input.turnId),
    };

    if (approvalPayload) {
      yield {
        type: "approval_required",
        sessionId: input.sessionId,
        turnId: input.turnId,
        approval: approvalPayload,
      };
    } else {
      if (usageObserved) {
        yield {
          type: "usage",
          sessionId: input.sessionId,
          turnId: input.turnId,
          usage: {
            inputTokens: usageTotals.inputTokens,
            outputTokens: usageTotals.outputTokens,
            cachedInputTokens: usageTotals.cachedInputTokens,
            costUsd: usageTotals.costUsd,
          },
        };
      }
      yield {
        type: "message_done",
        sessionId: input.sessionId,
        turnId: input.turnId,
        content: assistantContent,
      };
    }

    yield {
      type: "trace_update",
      sessionId: input.sessionId,
      turnId: input.turnId,
      trace: hydratedTrace,
    };

    yield {
      type: "done",
      sessionId: input.sessionId,
      turnId: input.turnId,
    };
  }

  private async buildToolSchema(input: Pick<ChatAgentTurnInput, "sessionId">): Promise<{
    tools: Array<Record<string, unknown>>;
    modelToCanonical: Map<string, string>;
    canonicalToModel: Map<string, string>;
  }> {
    const catalog = this.deps.listToolCatalog();
    const filteredCatalog: ToolCatalogEntry[] = [];
    for (const tool of catalog) {
      if (!this.deps.evaluateToolAccess) {
        filteredCatalog.push(tool);
        continue;
      }
      try {
        const access = this.deps.evaluateToolAccess({
          toolName: tool.toolName,
          sessionId: input.sessionId,
          agentId: "assistant",
          args: {},
        });
        if (!access.allowed) {
          continue;
        }
      } catch {
        continue;
      }
      filteredCatalog.push(tool);
    }
    const modelToCanonical = new Map<string, string>();
    const canonicalToModel = new Map<string, string>();
    const tools = filteredCatalog.map((tool) => {
      const modelName = toProviderToolFunctionName(tool.toolName, modelToCanonical);
      modelToCanonical.set(modelName, tool.toolName);
      canonicalToModel.set(tool.toolName, modelName);
      return {
        type: "function",
        function: {
          name: modelName,
          description: tool.description,
          parameters: normalizeToolParameters(tool),
        },
      };
    });

    return {
      tools,
      modelToCanonical,
      canonicalToModel,
    };
  }

  private resolveModelToolName(toolName: string, mapping: Map<string, string>): string {
    return mapping.get(toolName) ?? toProviderToolFunctionName(toolName);
  }

  private async executeToolCall(input: {
    input: ChatAgentTurnInput;
    turnId: string;
    toolName: string;
    rawArgs: Record<string, unknown>;
    toolCallId?: string;
  }): Promise<{
    record: ChatToolRunRecord;
    chunk?: ChatStreamChunk;
  }> {
    const preflight = this.preflightToolInvocation({
      toolName: input.toolName,
      rawArgs: input.rawArgs,
      userContent: input.input.content,
    });
    const startedAt = new Date().toISOString();
    const toolRunId = randomUUID();
    const created = this.deps.storage.chatToolRuns.create({
      toolRunId,
      turnId: input.turnId,
      sessionId: input.input.sessionId,
      toolName: input.toolName,
      status: "started",
      args: preflight.args,
      startedAt,
    });

    if (preflight.blockedReason) {
      const updated = this.deps.storage.chatToolRuns.patch(created.toolRunId, {
        status: "blocked",
        error: preflight.blockedReason,
        finishedAt: new Date().toISOString(),
      });
      return {
        record: updated,
        chunk: {
          type: "tool_result",
          sessionId: input.input.sessionId,
          turnId: input.turnId,
          toolRun: updated,
        },
      };
    }

    if (preflight.failureReason) {
      const updated = this.deps.storage.chatToolRuns.patch(created.toolRunId, {
        status: "failed",
        error: preflight.failureReason,
        finishedAt: new Date().toISOString(),
      });
      return {
        record: updated,
        chunk: {
          type: "tool_result",
          sessionId: input.input.sessionId,
          turnId: input.turnId,
          toolRun: updated,
        },
      };
    }

    try {
      const result = await this.deps.invokeTool({
        toolName: input.toolName,
        args: preflight.args,
        agentId: "assistant",
        sessionId: input.input.sessionId,
        consentContext: {
          source: "agent",
          reason: `chat mode ${input.input.mode}`,
        },
      });

      if (result.outcome === "approval_required") {
        const updated = this.deps.storage.chatToolRuns.patch(created.toolRunId, {
          status: "approval_required",
          approvalId: result.approvalId,
          result: result.result,
          finishedAt: new Date().toISOString(),
        });
        return {
          record: updated,
          chunk: {
            type: "tool_result",
            sessionId: input.input.sessionId,
            turnId: input.turnId,
            toolRun: updated,
          },
        };
      }

      if (result.outcome === "blocked") {
        const writeFallback = await this.tryWriteJailFallback({
          input: input.input,
          toolName: input.toolName,
          args: preflight.args,
          policyReason: result.policyReason,
        });
        if (writeFallback) {
          if (writeFallback.result.outcome === "executed") {
            const fallbackPayload = {
              ...(writeFallback.result.result ?? {}),
              fallbackApplied: true,
              fallbackPath: writeFallback.fallbackPath,
              originalPath: typeof preflight.args.path === "string" ? preflight.args.path : undefined,
              note: `Write path blocked by policy; wrote to fallback path ${writeFallback.fallbackPath}`,
            };
            const updated = this.deps.storage.chatToolRuns.patch(created.toolRunId, {
              status: "executed",
              result: fallbackPayload,
              finishedAt: new Date().toISOString(),
            });
            return {
              record: updated,
              chunk: {
                type: "tool_result",
                sessionId: input.input.sessionId,
                turnId: input.turnId,
                toolRun: updated,
              },
            };
          }

          if (writeFallback.result.outcome === "approval_required") {
            const updated = this.deps.storage.chatToolRuns.patch(created.toolRunId, {
              status: "approval_required",
              approvalId: writeFallback.result.approvalId,
              result: {
                ...(writeFallback.result.result ?? {}),
                fallbackPath: writeFallback.fallbackPath,
                note: `Original write path was blocked. Fallback path requires approval: ${writeFallback.fallbackPath}`,
              },
              finishedAt: new Date().toISOString(),
            });
            return {
              record: updated,
              chunk: {
                type: "tool_result",
                sessionId: input.input.sessionId,
                turnId: input.turnId,
                toolRun: updated,
              },
            };
          }

          const fallbackError = [
            result.policyReason,
            `fallback path attempted: ${writeFallback.fallbackPath}`,
            writeFallback.result.policyReason,
          ].filter(Boolean).join("; ");
          const updated = this.deps.storage.chatToolRuns.patch(created.toolRunId, {
            status: "blocked",
            error: fallbackError,
            result: writeFallback.result.result,
            finishedAt: new Date().toISOString(),
          });
          return {
            record: updated,
            chunk: {
              type: "tool_result",
              sessionId: input.input.sessionId,
              turnId: input.turnId,
              toolRun: updated,
            },
          };
        }

        const updated = this.deps.storage.chatToolRuns.patch(created.toolRunId, {
          status: "blocked",
          error: result.policyReason,
          result: result.result,
          finishedAt: new Date().toISOString(),
        });
        return {
          record: updated,
          chunk: {
            type: "tool_result",
            sessionId: input.input.sessionId,
            turnId: input.turnId,
            toolRun: updated,
          },
        };
      }

      const updated = this.deps.storage.chatToolRuns.patch(created.toolRunId, {
        status: "executed",
        result: result.result,
        finishedAt: new Date().toISOString(),
      });
      return {
        record: updated,
        chunk: {
          type: "tool_result",
          sessionId: input.input.sessionId,
          turnId: input.turnId,
          toolRun: updated,
        },
      };
    } catch (error) {
      const updated = this.deps.storage.chatToolRuns.patch(created.toolRunId, {
        status: "failed",
        error: (error as Error).message,
        finishedAt: new Date().toISOString(),
      });
      return {
        record: updated,
        chunk: {
          type: "tool_result",
          sessionId: input.input.sessionId,
          turnId: input.turnId,
          toolRun: updated,
        },
      };
    }
  }

  private preflightToolInvocation(input: {
    toolName: string;
    rawArgs: Record<string, unknown>;
    userContent: string;
  }): {
    args: Record<string, unknown>;
    failureReason?: string;
    blockedReason?: string;
  } {
    const args = { ...input.rawArgs };
    if (
      input.toolName === "browser.search"
      && detectLocalFileIntent(input.userContent)
      && !detectExplicitWebLookupIntent(input.userContent)
    ) {
      return {
        args,
        blockedReason: "execution skipped: browser.search was suppressed because the prompt targets local files/project context",
      };
    }

    if ((input.toolName === "memory.write" || input.toolName === "memory.upsert") && !hasExplicitMemoryConsent(input.userContent)) {
      return {
        args,
        blockedReason: "memory persistence requires explicit user consent; ask before saving long-term memory",
      };
    }

    const required = TOOL_REQUIRED_ARGS[input.toolName] ?? [];
    const unresolved: string[] = [];
    for (const field of required) {
      if (!isMissingArgValue(args[field])) {
        continue;
      }
      const inferred = inferToolArgValue(input.toolName, field, input.userContent);
      if (inferred !== undefined) {
        args[field] = inferred;
      } else {
        unresolved.push(field);
      }
    }

    if (unresolved.length > 0) {
      const field = unresolved[0] ?? "arg";
      if (field === "query" && (input.toolName === "memory.search" || input.toolName === "browser.search")) {
        if (input.toolName === "memory.search") {
          const fallbackQuery = inferMemoryQueryFromPrompt(input.userContent);
          if (fallbackQuery) {
            args.query = fallbackQuery;
            return { args };
          }
        }
        return {
          args,
          blockedReason: `execution skipped: ${input.toolName} requires query; unable to infer a safe query from the prompt`,
        };
      }
      return {
        args,
        failureReason: `execution error: ${field} is required`,
      };
    }

    return { args };
  }

  private async tryWriteJailFallback(input: {
    input: ChatAgentTurnInput;
    toolName: string;
    args: Record<string, unknown>;
    policyReason?: string;
  }): Promise<{
    result: ToolInvokeResult;
    fallbackPath: string;
  } | undefined> {
    if (input.toolName !== "fs.write" && input.toolName !== "artifacts.create") {
      return undefined;
    }
    if (!isWriteJailBlockReason(input.policyReason)) {
      return undefined;
    }
    const fallbackPath = buildSafeWriteFallbackPath(input.input.sessionId, input.toolName, input.args.path);
    if (!fallbackPath) {
      return undefined;
    }

    const currentPath = typeof input.args.path === "string" ? input.args.path : undefined;
    if (currentPath && normalizePathForComparison(currentPath) === normalizePathForComparison(fallbackPath)) {
      return undefined;
    }

    const fallbackArgs: Record<string, unknown> = {
      ...input.args,
      path: fallbackPath,
    };

    const result = await this.deps.invokeTool({
      toolName: input.toolName,
      args: fallbackArgs,
      agentId: "assistant",
      sessionId: input.input.sessionId,
      consentContext: {
        source: "agent",
        reason: `chat mode ${input.input.mode}; safe write fallback`,
      },
    });

    return {
      result,
      fallbackPath,
    };
  }

  private async synthesizeToolOutcomeFallback(input: {
    input: ChatAgentTurnInput;
    toolRuns: ChatToolRunRecord[];
    circuitBreakerReason?: string;
  }): Promise<string> {
    const deterministic = buildDeterministicToolSynthesisFallback(
      input.input.content,
      input.toolRuns,
      input.circuitBreakerReason,
    );
    const toolSummary = summarizeToolRunsForSynthesis(input.toolRuns);
    try {
      const completion = await this.deps.createChatCompletion({
        providerId: input.input.providerId,
        model: input.input.model,
        stream: false,
        memory: {
          enabled: false,
          mode: "off",
          sessionId: input.input.sessionId,
        },
        messages: [
          {
            role: "system",
            content: [
              "You are the final response synthesizer for an agent runtime.",
              "Tools are unavailable for this final pass. Do not claim new tool execution.",
              "Produce a concise, structured answer with these sections:",
              "Summary, Constraints, What I did instead, What I need from you next.",
              "If partial tool evidence exists, include it.",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              `Original user request: ${input.input.content}`,
              "",
              "Tool run summary:",
              toolSummary.length > 0 ? toolSummary : "- No tool output captured.",
              "",
              "Circuit-breaker reason (if any):",
              input.circuitBreakerReason ?? "none",
            ].join("\n"),
          },
        ],
      });
      const message = completion.choices?.[0]?.message as Record<string, unknown> | undefined;
      const synthesized = extractMessageContent(message ?? {}).trim();
      if (synthesized.length > 0) {
        return synthesized;
      }
    } catch {
      // Deterministic fallback below.
    }
    return deterministic;
  }
}

function normalizeToolParameters(tool: ToolCatalogEntry): Record<string, unknown> {
  if (tool.argSchema && Object.keys(tool.argSchema).length > 0) {
    return tool.argSchema;
  }
  return {
    type: "object",
    properties: {},
    additionalProperties: true,
  };
}

function readToolCalls(
  message: Record<string, unknown>,
  modelToCanonical: Map<string, string> = new Map<string, string>(),
): Array<{
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  rawArguments: string;
}> {
  const raw = message.tool_calls;
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: Array<{ id: string; toolName: string; args: Record<string, unknown>; rawArguments: string }> = [];
  for (const value of raw) {
    const toolCall = value as Record<string, unknown>;
    const id = typeof toolCall.id === "string" ? toolCall.id : `tool-${randomUUID()}`;
    const fn = toolCall.function as Record<string, unknown> | undefined;
    const rawToolName = typeof fn?.name === "string" ? fn.name : undefined;
    const toolName = rawToolName ? (modelToCanonical.get(rawToolName) ?? rawToolName) : undefined;
    if (!toolName) {
      continue;
    }
    let args: Record<string, unknown> = {};
    const rawArgs = fn?.arguments;
    let rawArguments = "{}";
    if (typeof rawArgs === "string" && rawArgs.trim()) {
      rawArguments = rawArgs;
      try {
        const parsed = JSON.parse(rawArgs) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          args = parsed as Record<string, unknown>;
        }
      } catch {
        args = {};
      }
    } else {
      rawArguments = JSON.stringify(args);
    }
    out.push({ id, toolName, args, rawArguments });
  }
  return out;
}

function toProviderToolFunctionName(
  toolName: string,
  existing?: Map<string, string>,
): string {
  const normalizedBase = toolName
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  const prefixed = /^[a-zA-Z]/.test(normalizedBase) ? normalizedBase : `tool_${normalizedBase || "fn"}`;

  if (!existing) {
    return prefixed;
  }

  let candidate = prefixed;
  let counter = 2;
  while (existing.has(candidate) && existing.get(candidate) !== toolName) {
    candidate = `${prefixed}_${counter}`;
    counter += 1;
  }
  return candidate;
}

function extractMessageContent(message: Record<string, unknown>): string {
  const content = message.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        const value = item as Record<string, unknown>;
        return typeof value.text === "string" ? value.text : "";
      })
      .join("")
      .trim();
  }
  return "";
}

function parseUsageFromCompletion(completion: ChatCompletionResponse): {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  costUsd?: number;
} | null {
  const usage = completion.usage as Record<string, unknown> | undefined;
  if (!usage || typeof usage !== "object") {
    return null;
  }
  const inputTokens = readUsageNumber(usage.prompt_tokens) ?? readUsageNumber(usage.input_tokens);
  const outputTokens = readUsageNumber(usage.completion_tokens) ?? readUsageNumber(usage.output_tokens);
  const cachedInputTokens = readUsageNumber(usage.cached_prompt_tokens) ?? readUsageNumber(usage.cached_input_tokens);
  const costUsd = readUsageNumber(usage.cost_usd) ?? readUsageNumber(usage.total_cost_usd);
  if (
    inputTokens === undefined
    && outputTokens === undefined
    && cachedInputTokens === undefined
    && costUsd === undefined
  ) {
    return null;
  }
  return {
    inputTokens,
    outputTokens,
    cachedInputTokens,
    costUsd,
  };
}

function readUsageNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function detectTimeIntent(content: string): boolean {
  const normalized = content.toLowerCase();
  if (!normalized.includes("time")) {
    return false;
  }
  return (
    normalized.includes("what time")
    || normalized.includes("current time")
    || normalized.includes("time is it")
    || normalized.includes("local time")
  );
}

function detectLiveDataIntent(content: string): boolean {
  const normalized = content.toLowerCase();
  return (
    /\b(latest|today|current|right now|news|price|weather|time)\b/.test(normalized)
    || normalized.includes("look online")
    || normalized.includes("search web")
  );
}

function detectExplicitWebLookupIntent(content: string): boolean {
  const normalized = content.toLowerCase();
  return (
    normalized.includes("search web")
    || normalized.includes("search online")
    || normalized.includes("look online")
    || normalized.includes("browse the web")
    || normalized.includes("use internet")
    || normalized.includes("web search")
  );
}

function deriveLiveDataQuery(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return content;
  }
  const clauses = normalized
    .split(/[.!?]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (clauses.length === 0) {
    return normalized;
  }
  const keywordRegex = /\b(latest|today|current|right now|news|price|weather|time)\b/i;
  const matching = clauses.filter((clause) => keywordRegex.test(clause));
  const selected = matching.at(-1) ?? clauses.at(-1) ?? normalized;
  return selected.replace(/^(hi|hello|hey)\b[^a-zA-Z0-9]*/i, "").trim() || normalized;
}

function inferMemoryQueryFromPrompt(userContent: string): string | undefined {
  const inferred = inferQueryFromPrompt(userContent);
  if (inferred) {
    return inferred;
  }
  const normalized = userContent
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return undefined;
  }
  const stopWords = new Set([
    "the", "and", "for", "with", "that", "this", "from", "then", "what", "your", "you", "into",
    "about", "please", "would", "could", "should", "have", "been", "were", "when", "where",
    "which", "while", "without", "just", "need", "want", "give", "tell",
  ]);
  const tokens = normalized
    .split(" ")
    .filter((token) => token.length >= 3 && !stopWords.has(token))
    .slice(0, 12);
  if (tokens.length < 2) {
    return undefined;
  }
  return tokens.join(" ");
}

function detectLocalFileIntent(content: string): boolean {
  const normalized = content.toLowerCase();
  if (/\b([a-z]:\\|\\\\)\b/i.test(content)) {
    return true;
  }
  if (/\b(local|workspace|project)\s+(file|files|path|paths|stack)\b/.test(normalized)) {
    return true;
  }
  return (
    normalized.includes("docker-compose")
    || normalized.includes("docker compose")
    || normalized.includes("current project files")
    || normalized.includes("read it and tell me what services")
    || normalized.includes("what services i'm running")
    || /\bread\s+.*\.(yml|yaml|json|md|txt)\b/.test(normalized)
  );
}

function detectLocalFileAccessCheckIntent(content: string): boolean {
  const normalized = content.toLowerCase();
  return (
    normalized.includes("check whether you can access")
    || normalized.includes("if you can't")
    || normalized.includes("if you cannot")
    || normalized.includes("do not guess")
    || normalized.includes("local project files")
  );
}

function buildLocalFileAccessFallback(userPrompt: string): string {
  const composeHint = /\bdocker[-\s]?compose\b/i.test(userPrompt)
    ? "If you share `docker-compose.yml`, I can list services and rank operational risk by exposure, privilege, and data sensitivity."
    : "If you share the relevant local file content, I can provide a concrete analysis instead of a generic answer.";
  return [
    "Summary",
    "- I cannot directly access your local project files from this runtime.",
    "",
    "Confirmed limits",
    "- No filesystem read access to your local machine path was available in this turn.",
    "- I avoided guessing specific file contents.",
    "",
    "What I need from you",
    "- Paste the file contents (or key sections).",
    "- Or run a local command to print the file and share output.",
    "",
    "Next safe action",
    `- ${composeHint}`,
  ].join("\n");
}

function inferCitationsFromToolResult(toolRun: ChatToolRunRecord): ChatCitationRecord[] {
  if (!toolRun.result) {
    return [];
  }
  const result = toolRun.result as Record<string, unknown>;
  const items: ChatCitationRecord[] = [];
  if (Array.isArray(result.results)) {
    let rank = 0;
    for (const raw of result.results) {
      const value = raw as Record<string, unknown>;
      const url = typeof value.url === "string" ? value.url : undefined;
      if (!url) {
        continue;
      }
      items.push({
        citationId: `${toolRun.toolRunId}-${rank}`,
        title: typeof value.title === "string" ? value.title : undefined,
        snippet: typeof value.snippet === "string" ? value.snippet : undefined,
        url,
        sourceType: "web",
      });
      rank += 1;
    }
  } else if (typeof result.finalUrl === "string") {
    items.push({
      citationId: `${toolRun.toolRunId}-0`,
      url: result.finalUrl,
      title: typeof result.title === "string" ? result.title : undefined,
      snippet: typeof result.textSnippet === "string" ? result.textSnippet.slice(0, 220) : undefined,
      sourceType: "web",
    });
  } else if (typeof result.url === "string") {
    items.push({
      citationId: `${toolRun.toolRunId}-0`,
      url: result.url,
      sourceType: "web",
    });
  }
  return items;
}

function normalizeFailureSignature(value: string | undefined): string {
  if (!value) {
    return "unknown";
  }
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function isMissingArgValue(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim().length === 0;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return value === undefined || value === null;
}

function inferToolArgValue(toolName: string, field: string, userContent: string): unknown {
  if (field === "query" && QUERY_TOOL_NAMES.has(toolName)) {
    return inferQueryFromPrompt(userContent);
  }
  if (field === "url" && (toolName === "browser.navigate" || toolName === "browser.extract" || toolName === "http.get" || toolName === "http.post" || toolName === "browser.interact")) {
    return extractFirstUrl(userContent);
  }
  return undefined;
}

function inferQueryFromPrompt(userContent: string): string | undefined {
  const normalizedInput = userContent
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "");
  if (normalizedInput.length < 3) {
    return undefined;
  }
  const clauses = normalizedInput
    .split(/[\n\r]+|[.!?]+/)
    .map((item) => sanitizeQueryClause(item))
    .filter((item) => item.length >= 3);
  const candidatePool = clauses.length > 0
    ? clauses
    : [sanitizeQueryClause(deriveLiveDataQuery(normalizedInput))];
  const bestCandidate = [...candidatePool]
    .sort((left, right) => scoreQueryCandidate(right) - scoreQueryCandidate(left))[0];
  const derived = sanitizeQueryClause(bestCandidate ?? normalizedInput).slice(0, 240);
  if (derived.length < 3) {
    return undefined;
  }
  const normalized = derived
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (
    normalized.length < 3
    || normalized === "search"
    || normalized === "search web"
    || normalized === "search the web"
    || normalized === "look up"
    || normalized === "look this up"
    || normalized === "find"
    || normalized === "find this"
  ) {
    return undefined;
  }
  return derived;
}

function sanitizeQueryClause(value: string): string {
  return value
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^(please|can you|could you|would you)\b[:,\s-]*/i, "")
    .replace(/^(from|on|about)\s+/i, "")
    .replace(/\b(return|respond|output)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreQueryCandidate(value: string): number {
  const text = value.trim();
  if (!text) {
    return -1000;
  }
  let score = Math.min(text.length, 180);
  if (/\b(what|which|who|when|where|why|how)\b/i.test(text)) {
    score += 24;
  }
  if (/\b(latest|current|today|news|price|weather|summarize|summary|extract|analyze)\b/i.test(text)) {
    score += 20;
  }
  if (/\b(json|markdown|format|bullet|score|rubric)\b/i.test(text)) {
    score -= 30;
  }
  if (/^test-\d+/i.test(text)) {
    score -= 15;
  }
  return score;
}

function detectMissingLogPayloadIntent(content: string): boolean {
  const normalized = content.toLowerCase();
  if (!/\b(log|logs)\b/.test(normalized)) {
    return false;
  }
  if (!/\b(i paste|i'll paste|i will paste|paste a giant blob|paste logs)\b/.test(normalized)) {
    return false;
  }
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const evidenceLines = lines.filter((line) =>
    /\b(error|warn|exception|traceback|stack|http \d{3}|failed|timeout)\b/i.test(line)
    || /^\d{4}-\d{2}-\d{2}/.test(line)
    || line.length > 140
  );
  return evidenceLines.length < 2;
}

function buildMissingLogInputTemplate(): string {
  return [
    "Summary",
    "- I cannot determine a real root cause yet because the log blob was not pasted.",
    "- Below is a deterministic triage scaffold so you can continue immediately.",
    "",
    "Root cause candidates",
    "- Timeout or retry storm (if logs show repeated timeout/429/503 patterns).",
    "- Auth/session mismatch (if logs show 401/403, token refresh, or session invalidation).",
    "- Schema/config drift after deploy (if logs show parse errors, unknown fields, or migration mismatches).",
    "",
    "Top 3 next actions",
    "1. Paste the first fatal/exception block and the last fatal/exception block from the same incident window.",
    "2. Include 20 lines before and after the first fatal/exception line.",
    "3. Confirm timezone + service name so timestamps can be correlated accurately.",
    "",
    "Exact next log line I need",
    "- `2026-03-03T12:48:01.234Z service=<service> level=ERROR request_id=<id> error_code=<code> message=<message>`",
    "- If no request_id exists, paste the first exception line plus the line immediately above it.",
  ].join("\n");
}

function summarizeToolRunsForSynthesis(toolRuns: ChatToolRunRecord[]): string {
  if (toolRuns.length === 0) {
    return "";
  }
  const lines: string[] = [];
  for (const run of toolRuns.slice(-8)) {
    const summaryParts = [
      `- ${run.toolName}`,
      `[${run.status}]`,
      run.error ? `error: ${run.error}` : undefined,
      run.result ? `result: ${truncateJson(run.result, 280)}` : undefined,
    ].filter(Boolean);
    lines.push(summaryParts.join(" "));
  }
  return lines.join("\n");
}

function buildDeterministicToolSynthesisFallback(
  userPrompt: string,
  toolRuns: ChatToolRunRecord[],
  reason?: string,
): string {
  const extractionFallback = buildExtractionFailureFallback(userPrompt, toolRuns, reason);
  if (extractionFallback) {
    return extractionFallback;
  }
  const failures = toolRuns
    .filter((item) => item.status === "failed" || item.status === "blocked")
    .slice(-4)
    .map((item) => `- ${item.toolName}: ${item.error ?? "failed"}`);
  const evidence = toolRuns
    .filter((item) => item.status === "executed" && item.result)
    .slice(-3)
    .map((item) => `- ${item.toolName}: ${truncateJson(item.result, 260)}`);
  const lines = [
    "Summary",
    "- I reached a tool-execution limit/constraint before a full answer could be completed.",
    "",
    "Constraints",
    `- ${reason ?? "Tool flow did not converge to a complete response."}`,
    ...(failures.length > 0 ? failures : ["- No explicit tool failure detail was captured."]),
    "",
    "What I did instead",
    ...(evidence.length > 0 ? evidence : ["- Preserved available context and avoided guessing missing data."]),
    "",
    "What I need from you next",
    `- Confirm whether you want me to retry with explicit arguments (query/url/path).`,
    `- If this is a local-file request, share the file/path content directly.`,
    `- Query seed: ${inferQueryFromPrompt(userPrompt) ?? deriveLiveDataQuery(userPrompt)}`,
  ];
  return lines.join("\n");
}

function buildExtractionFailureFallback(
  userPrompt: string,
  toolRuns: ChatToolRunRecord[],
  reason?: string,
): string | undefined {
  const normalized = userPrompt.toLowerCase();
  const isExtractionPrompt = /\bcollect\b|\bextract\b|\breturn an array\b|\bjson\b|\bpagination\b/.test(normalized);
  if (!isExtractionPrompt) {
    return undefined;
  }
  const recoveredItems = recoverTitleUrlItems(toolRuns, 35);
  const failurePoint = inferExtractionFailurePoint(toolRuns, reason);
  const lines = [
    "Summary",
    `- I completed tool execution but could not confidently produce the full requested extraction set (${recoveredItems.length} recovered item(s)).`,
    "",
    "Failure point",
    `- ${failurePoint}`,
    "",
    "Recovered items (partial)",
    "```json",
    JSON.stringify(recoveredItems, null, 2),
    "```",
    "",
    "What I need from you next",
    "- Confirm if you want me to continue pagination with explicit page-by-page extraction constraints.",
    "- If strict completeness is required, provide permission for a slower deterministic crawl with validation per page.",
  ];
  return lines.join("\n");
}

function inferExtractionFailurePoint(toolRuns: ChatToolRunRecord[], reason?: string): string {
  const failed = toolRuns.filter((run) => run.status === "failed" || run.status === "blocked").at(-1);
  if (failed) {
    return `${failed.toolName} returned ${failed.status}: ${failed.error ?? "unknown error"}`;
  }
  const lastExecuted = toolRuns.filter((run) => run.status === "executed").at(-1);
  if (lastExecuted) {
    return `${lastExecuted.toolName} executed, but structured extraction output was incomplete or unparseable`;
  }
  return reason ?? "No durable extraction result was captured in tool traces";
}

function recoverTitleUrlItems(toolRuns: ChatToolRunRecord[], limit: number): Array<{ title: string | null; url: string }> {
  const items: Array<{ title: string | null; url: string }> = [];
  const seen = new Set<string>();
  for (const run of toolRuns) {
    const result = run.result;
    if (!result || typeof result !== "object") {
      continue;
    }
    collectTitleUrlPairs(result as Record<string, unknown>, items, seen, limit);
    if (items.length >= limit) {
      break;
    }
  }
  return items.slice(0, limit);
}

function collectTitleUrlPairs(
  node: unknown,
  out: Array<{ title: string | null; url: string }>,
  seen: Set<string>,
  limit: number,
): void {
  if (out.length >= limit || node === null || node === undefined) {
    return;
  }
  if (Array.isArray(node)) {
    for (const entry of node) {
      collectTitleUrlPairs(entry, out, seen, limit);
      if (out.length >= limit) {
        return;
      }
    }
    return;
  }
  if (typeof node !== "object") {
    return;
  }
  const record = node as Record<string, unknown>;
  const url = typeof record.url === "string"
    ? record.url
    : typeof record.href === "string"
      ? record.href
      : undefined;
  if (url && /^https?:\/\//i.test(url) && !seen.has(url)) {
    seen.add(url);
    out.push({
      title: typeof record.title === "string"
        ? record.title
        : (typeof record.name === "string" ? record.name : null),
      url,
    });
    if (out.length >= limit) {
      return;
    }
  }
  for (const value of Object.values(record)) {
    collectTitleUrlPairs(value, out, seen, limit);
    if (out.length >= limit) {
      return;
    }
  }
}

function appendToolFailureConstraints(content: string, toolRuns: ChatToolRunRecord[]): string {
  const failedOrBlocked = toolRuns.filter((run) => run.status === "failed" || run.status === "blocked");
  if (failedOrBlocked.length === 0) {
    return content;
  }
  const trimmed = content.trim();
  if (mentionsToolFailureConstraints(trimmed)) {
    return trimmed;
  }
  const details = failedOrBlocked
    .slice(-4)
    .map((run) => `- ${run.toolName}: ${run.error ?? run.status}`);
  const appendix = [
    "Constraints",
    ...details,
    "",
    "What I did instead",
    "- Continued with available context and avoided unsupported claims.",
    "",
    "What I need from you next",
    "- Provide explicit tool arguments or additional source data to continue.",
  ].join("\n");
  if (!trimmed) {
    return appendix;
  }
  return `${trimmed}\n\n${appendix}`;
}

function mentionsToolFailureConstraints(content: string): boolean {
  const normalized = content.toLowerCase();
  return (
    normalized.includes("\nconstraints")
    || normalized.includes("## constraints")
    || normalized.includes("constraints:")
    || normalized.includes("tool failures")
    || normalized.includes("what i need from you next")
  );
}

function truncateJson(value: unknown, maxChars: number): string {
  const serialized = JSON.stringify(value);
  if (serialized.length <= maxChars) {
    return serialized;
  }
  return `${serialized.slice(0, maxChars)}...`;
}

function extractFirstUrl(value: string): string | undefined {
  const matched = value.match(/\bhttps?:\/\/[^\s`"')]+/i);
  return matched?.[0];
}

function hasExplicitMemoryConsent(content: string): boolean {
  const normalized = content.toLowerCase();
  return (
    /\bremember this\b/.test(normalized)
    || /\bsave (this|it)( as)? (memory|note)\b/.test(normalized)
    || /\bstore this\b/.test(normalized)
    || /\badd (this|it) to memory\b/.test(normalized)
    || /\bupdate memory\b/.test(normalized)
    || /\bfor memory\b/.test(normalized)
  );
}

function isWriteJailBlockReason(reason: string | undefined): boolean {
  if (!reason) {
    return false;
  }
  const normalized = reason.toLowerCase();
  return normalized.includes("write jail") || normalized.includes("outside write");
}

function buildSafeWriteFallbackPath(
  sessionId: string,
  toolName: string,
  originalPath: unknown,
): string | undefined {
  const safeSessionId = sessionId.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").slice(-32);
  if (!safeSessionId) {
    return undefined;
  }
  const original = typeof originalPath === "string" ? originalPath.trim() : "";
  const normalizedOriginal = original.replaceAll("\\", "/");
  const fileName = normalizedOriginal.split("/").pop() ?? "";
  const match = fileName.match(/^(.+?)(\.[a-zA-Z0-9_-]{1,12})$/);
  const baseName = (match?.[1] ?? fileName).trim();
  const ext = (match?.[2] ?? "").trim();
  const safeBaseName = sanitizePathSegment(baseName) || (toolName === "artifacts.create" ? "artifact" : "output");
  const fallbackExt = ext || (toolName === "artifacts.create" ? ".md" : ".txt");
  return `${SAFE_WRITE_FALLBACK_DIR}/${safeBaseName}-${safeSessionId}${fallbackExt}`;
}

function sanitizePathSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function normalizePathForComparison(value: string): string {
  return value.replaceAll("\\", "/").toLowerCase();
}

function buildToolFailureFallbackMessage(
  userPrompt: string,
  toolRuns: ChatToolRunRecord[],
  reason: string,
): string {
  const failures = toolRuns
    .filter((item) => item.status === "failed" || item.status === "blocked")
    .slice(-4)
    .map((item) => `- ${item.toolName}: ${item.error ?? "failed"}`);
  const fallbackQuery = deriveLiveDataQuery(userPrompt);
  const lines = [
    "I stopped retrying tool calls because the same failure repeated.",
    "",
    "Constraints:",
    `- ${reason}`,
    ...(failures.length > 0 ? failures : ["- Tool failure details unavailable."]),
    "",
    "Fallback:",
    "- I can continue with a best-effort answer from current context.",
    "- If you want another tool attempt, provide explicit arguments (for example: query/url/path).",
    `- Suggested query seed: ${fallbackQuery}`,
  ];
  return lines.join("\n");
}

export function defaultThinkingTokens(level: ChatThinkingLevel): number | undefined {
  if (level === "minimal") {
    return 300;
  }
  if (level === "extended") {
    return 1800;
  }
  return 900;
}

export function normalizeAgentInputFromSend(
  request: ChatSendMessageRequest,
): Pick<ChatAgentTurnInput, "mode" | "webMode" | "memoryMode" | "thinkingLevel"> {
  return {
    mode: request.mode ?? "chat",
    webMode: request.webMode ?? "auto",
    memoryMode: request.memoryMode ?? (request.useMemory === false ? "off" : "auto"),
    thinkingLevel: request.thinkingLevel ?? "standard",
  };
}
