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
  ChatTurnBranchKind,
  ChatTurnFailureClass,
  ChatTurnFailureRecord,
  ChatTurnTraceRecord,
  ChatWebMode,
  ToolCatalogEntry,
  ToolInvokeRequest,
  ToolInvokeResult,
  McpInvokeRequest,
  McpInvokeResponse,
} from "@goatcitadel/contracts";
import { getChatTurnRecoveryAction, type ChatTurnRecoveryAction } from "@goatcitadel/contracts";
import type { Storage } from "@goatcitadel/storage";
import { hasLiveDataKeywords, EXPLICIT_WEB_PHRASES } from "../orchestration/live-data-detect.js";
import type { McpBrowserFallbackTarget } from "./mcp-runtime.js";

const MAX_TOOL_LOOPS = 6;
const MAX_TOOL_RUNS_PER_TURN = 12;
const TOOL_FAILURE_CIRCUIT_BREAKER_THRESHOLD = 2;
const SAFE_WRITE_FALLBACK_DIR = "./workspace/goatcitadel_out";
const QUERY_TOOL_NAMES = new Set(["browser.search", "memory.search", "embeddings.query"]);
const WEB_TOOL_NAMES = new Set([
  "browser.search",
  "browser.navigate",
  "browser.extract",
  "browser.interact",
  "http.get",
  "http.post",
]);
const MCP_BROWSER_FALLBACK_TOOL_NAMES = new Set([
  "browser.search",
  "browser.navigate",
  "browser.extract",
  "http.get",
]);
const REMOTE_BLOCK_MARKERS = [
  "attention required!",
  "just a moment...",
  "you have been blocked",
  "security verification",
  "cloudflare ray id",
  "captcha",
  "enable javascript and cookies",
  "sorry, you have been blocked",
];
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

interface ChatExecutionBudget {
  turnBudgetMs: number;
  completionTimeoutMs: number;
  maxToolLoops: number;
  maxToolRunsPerTurn: number;
  searchMaxResults: number;
  maxTokens?: number;
}

class ChatTurnBudgetExceededError extends Error {
  public constructor(
    public readonly webMode: ChatWebMode,
    public readonly turnBudgetMs: number,
  ) {
    super(buildTurnBudgetExceededReason(webMode, turnBudgetMs));
    this.name = "ChatTurnBudgetExceededError";
  }
}

type ChatCompletionMessage = ChatCompletionRequest["messages"][number];

export interface ChatAgentTurnInput {
  sessionId: string;
  turnId: string;
  userMessageId: string;
  parentTurnId?: string;
  branchKind?: ChatTurnBranchKind;
  sourceTurnId?: string;
  content: string;
  mode: ChatMode;
  model?: string;
  providerId?: string;
  webMode: ChatWebMode;
  memoryMode: "auto" | "on" | "off";
  thinkingLevel: ChatThinkingLevel;
  toolAutonomy: "safe_auto" | "manual";
  historyMessages: ChatCompletionRequest["messages"];
  outputMessageId?: string;
  signal?: AbortSignal;
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
  createChatCompletionStream?: (request: ChatCompletionRequest) => AsyncGenerator<Record<string, unknown>>;
  invokeTool: (request: ToolInvokeRequest) => Promise<ToolInvokeResult>;
  invokeMcpTool?: (request: McpInvokeRequest) => Promise<McpInvokeResponse>;
  listMcpBrowserFallbackTargets?: () => McpBrowserFallbackTarget[];
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
    throwIfChatTurnCancelled(input);
    const now = new Date().toISOString();
    const intents = {
      liveData: detectLiveDataIntent(input.content),
      time: detectTimeIntent(input.content),
      localFile: detectLocalFileIntent(input.content),
      missingLogPayload: detectMissingLogPayloadIntent(input.content),
    };
    const trace = this.deps.storage.chatTurnTraces.create({
      turnId: input.turnId,
      sessionId: input.sessionId,
      userMessageId: input.userMessageId,
      parentTurnId: input.parentTurnId,
      branchKind: input.branchKind ?? "append",
      sourceTurnId: input.sourceTurnId,
      status: "running",
      mode: input.mode,
      model: input.model,
      webMode: input.webMode,
      memoryMode: input.memoryMode,
      thinkingLevel: input.thinkingLevel,
      effectiveToolAutonomy: input.toolAutonomy,
      routing: {
        liveDataIntent: intents.liveData,
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
    const localFileIntent = intents.localFile;
    const citations: ChatCitationRecord[] = [];
    const toolRuns: ChatToolRunRecord[] = [];
    let toolRunCount = 0;
    let assistantContent = "";
    let assistantModel = input.model;
    let routingState: ChatTurnTraceRecord["routing"] = {
      liveDataIntent: intents.liveData,
      primaryProviderId: input.providerId,
      primaryModel: input.model,
      effectiveProviderId: input.providerId,
      effectiveModel: input.model,
    };
    let finalStatus: ChatTurnTraceRecord["status"] = "completed";
    let finalFailure: ChatTurnFailureRecord | undefined;
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
    const outputMessageId = input.outputMessageId ?? `assistant-${input.turnId}`;
    const executionBudget = resolveChatExecutionBudget(input);
    const turnBudgetDeadline = createTurnBudgetDeadline(executionBudget.turnBudgetMs);

    if (intents.missingLogPayload) {
      assistantContent = buildMissingLogInputTemplate();
    }
    if (!assistantContent && localFileIntent && detectLocalFileAccessCheckIntent(input.content)) {
      assistantContent = buildLocalFileAccessFallback(input.content);
    }
    if (!assistantContent) {
      const clarificationFollowUp = buildClarificationFollowUpIfNeeded(input.content, input.historyMessages);
      if (clarificationFollowUp) {
        assistantContent = clarificationFollowUp;
      }
    }
    if (!assistantContent) {
      const clarificationPrompt = buildClarificationPromptIfNeeded(input.content);
      if (clarificationPrompt) {
        assistantContent = clarificationPrompt;
      }
    }
    if (!assistantContent) {
      const settingsConflict = buildLiveDataSettingsConflictMessage({
        liveDataIntent: intents.liveData,
        timeIntent: intents.time,
        localFileIntent,
        webMode: input.webMode,
        toolAutonomy: input.toolAutonomy,
      });
      if (settingsConflict) {
        assistantContent = settingsConflict;
      }
    }

    // Deterministic live-time helper for simple queries.
    if (!assistantContent && intents.time && canUseTimeTool) {
      throwIfChatTurnCancelled(input);
      this.deps.storage.chatTurnTraces.patch(input.turnId, {
        status: "waiting_for_tool",
      });
      ensureChatTurnBudgetRemaining(turnBudgetDeadline, input.webMode, executionBudget.turnBudgetMs);
      const syntheticRun = await this.executeToolCall({
        input,
        turnId: input.turnId,
        toolName: "time.now",
        rawArgs: {},
        localFileIntent,
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
        finalStatus = "waiting_for_approval";
        finalFailure = {
          failureClass: "approval_required",
          message: "Approval required by policy.",
          retryable: true,
          recommendedAction: getChatTurnRecoveryAction("approval_required"),
        };
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
      && intents.liveData
      && !localFileIntent
      && !intents.time
      && canUseSearchTool
      && toolRunCount < executionBudget.maxToolRunsPerTurn
    ) {
      throwIfChatTurnCancelled(input);
      this.deps.storage.chatTurnTraces.patch(input.turnId, {
        status: "waiting_for_tool",
      });
      ensureChatTurnBudgetRemaining(turnBudgetDeadline, input.webMode, executionBudget.turnBudgetMs);
      const liveDataQuery = deriveLiveDataQuery(input.content);
      const syntheticRun = await this.executeToolCall({
        input,
        turnId: input.turnId,
        toolName: "browser.search",
        rawArgs: {
          query: liveDataQuery,
          maxResults: executionBudget.searchMaxResults,
        },
        localFileIntent,
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
                  maxResults: executionBudget.searchMaxResults,
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
        finalStatus = "waiting_for_approval";
        finalFailure = {
          failureClass: "approval_required",
          message: "Approval required by policy.",
          retryable: true,
          recommendedAction: getChatTurnRecoveryAction("approval_required"),
        };
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

    if (intents.liveData && toolRuns.length > 0) {
      conversationMessages.push({
        role: "system",
        content: buildEvidenceGroundingInstruction(),
      } as ChatCompletionMessage);
    }

    if (!assistantContent) {
      try {
        for (let loop = 0; loop < executionBudget.maxToolLoops; loop += 1) {
          throwIfChatTurnCancelled(input);
          this.deps.storage.chatTurnTraces.patch(input.turnId, {
            status: "running",
          });
          const loopTrace: ChatTurnTraceRecord = {
            ...trace,
            routing: {
              ...routingState,
              fallbackReason: `loop ${loop + 1}/${executionBudget.maxToolLoops}, tool_runs=${toolRunCount}`,
            },
            toolRuns: this.deps.storage.chatToolRuns.listByTurn(input.turnId),
            citations: [...citations],
          };
          yield {
            type: "trace_update",
            sessionId: input.sessionId,
            turnId: input.turnId,
            trace: loopTrace,
          };

          const completionTimeoutMs = Math.min(
            executionBudget.completionTimeoutMs,
            ensureChatTurnBudgetRemaining(turnBudgetDeadline, input.webMode, executionBudget.turnBudgetMs),
          );
          const completionRequest: ChatCompletionRequest = {
            providerId: input.providerId,
            model: input.model,
            messages: conversationMessages,
            stream: false,
            max_tokens: executionBudget.maxTokens,
            timeoutMs: completionTimeoutMs,
            memory: {
              enabled: input.memoryMode !== "off",
              mode: input.memoryMode === "off" ? "off" : "qmd",
              sessionId: input.sessionId,
            },
            tools: toolSchema.tools.length > 0 ? toolSchema.tools : undefined,
            tool_choice: toolSchema.tools.length > 0 ? "auto" : undefined,
          };

          let completion: ChatCompletionResponse;
          if (this.deps.createChatCompletionStream) {
            try {
              const aggregate = createCompletionStreamAggregate();
              for await (const rawChunk of this.deps.createChatCompletionStream({
                ...completionRequest,
                stream: true,
              })) {
                const streamed = absorbCompletionStreamChunk(aggregate, rawChunk);
                if (streamed.delta && !streamed.sawToolCall) {
                  yield {
                    type: "delta",
                    sessionId: input.sessionId,
                    turnId: input.turnId,
                    messageId: input.outputMessageId,
                    delta: streamed.delta,
                  };
                }
              }
              completion = buildCompletionFromAggregate(aggregate);
            } catch {
              completion = await this.deps.createChatCompletion(completionRequest);
            }
          } else {
            completion = await this.deps.createChatCompletion(completionRequest);
          }
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
          throwIfChatTurnCancelled(input);
          if (toolRunCount >= executionBudget.maxToolRunsPerTurn) {
            throw new Error("Tool run limit reached for this turn.");
          }
          if (circuitBreakerReason) {
            break;
          }
          ensureChatTurnBudgetRemaining(turnBudgetDeadline, input.webMode, executionBudget.turnBudgetMs);
          this.deps.storage.chatTurnTraces.patch(input.turnId, {
            status: "waiting_for_tool",
          });
          toolRunCount += 1;
          const executed = await this.executeToolCall({
            input,
            turnId: input.turnId,
            toolName: toolCall.toolName,
            rawArgs: toolCall.args,
            toolCallId: toolCall.id,
            localFileIntent,
            priorToolRuns: toolRuns,
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
            finalStatus = "waiting_for_approval";
            finalFailure = {
              failureClass: "approval_required",
              message: "Approval required by policy.",
              retryable: true,
              recommendedAction: getChatTurnRecoveryAction("approval_required"),
            };
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
            const retryableFailure = executed.record.status === "failed"
              && isRetryableToolFailure(executed.record.error);
            if (!retryableFailure) {
              // P2-9: Include URL in signature so failures on different URLs aren't collapsed.
              const urlSuffix = typeof executed.record.args?.url === "string" ? `:${executed.record.args.url}` : "";
              const signature = `${executed.record.toolName}:${normalizeFailureSignature(executed.record.error)}${urlSuffix}`;
              const nextCount = (toolFailureSignatureCounts.get(signature) ?? 0) + 1;
              toolFailureSignatureCounts.set(signature, nextCount);
              const threshold = shouldTripToolCircuitBreakerImmediately(executed.record.error)
                ? 1
                : TOOL_FAILURE_CIRCUIT_BREAKER_THRESHOLD;
              if (nextCount >= threshold) {
                circuitBreakerReason = threshold === 1
                  ? `Non-recoverable tool failure for ${executed.record.toolName}: ${executed.record.error ?? "unknown error"}`
                  : `Repeated tool failure for ${executed.record.toolName} (${nextCount} attempts): ${executed.record.error ?? "unknown error"}`;
                break;
              }
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
          finalFailure = buildChatTurnFailureRecord(
            classifyChatTurnFailure({
              toolRuns,
            }),
            circuitBreakerReason,
          );
          break;
        }
      }
      } catch (error) {
        if (isChatTurnAbortError(error, input.signal)) {
          finalStatus = "cancelled";
          assistantContent = "";
          finalFailure = undefined;
        } else if (error instanceof ChatTurnBudgetExceededError) {
          finalStatus = "completed";
          assistantContent = buildTurnBudgetExceededFallbackMessage(
            input,
            toolRuns,
            error.turnBudgetMs,
          );
          finalFailure = buildChatTurnFailureRecord(
            "budget_exceeded",
            error.message,
            input.webMode === "deep" ? "retry_narrower" : "switch_to_deep_mode",
          );
        } else {
          finalStatus = "failed";
          finalFailure = buildChatTurnFailureRecord(
            classifyChatTurnFailure({
              error,
              toolRuns,
            }),
            (error as Error).message,
          );
          assistantContent = buildUserSafeFailureMessage(finalFailure);
          yield {
            type: "error",
            sessionId: input.sessionId,
            turnId: input.turnId,
            error: assistantContent,
          };
        }
      }
    }

    if (!approvalPayload && finalStatus !== "cancelled" && assistantContent.trim().length === 0) {
      assistantContent = await this.synthesizeToolOutcomeFallback({
        input,
        toolRuns,
        circuitBreakerReason,
      });
    }
    if (finalStatus !== "cancelled") {
      assistantContent = appendToolFailureConstraints(assistantContent, toolRuns);
    }

    const finishedAt = new Date().toISOString();
    const updatedTrace = this.deps.storage.chatTurnTraces.patch(input.turnId, {
      status: finalStatus,
      model: assistantModel,
      failure: finalFailure,
      routing: {
        ...routingState,
        liveDataIntent: intents.liveData,
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
    } else if (finalStatus !== "cancelled") {
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
        messageId: outputMessageId,
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
      messageId: outputMessageId,
    };
  }

  private async buildToolSchema(input: Pick<ChatAgentTurnInput, "sessionId" | "webMode">): Promise<{
    tools: Array<Record<string, unknown>>;
    modelToCanonical: Map<string, string>;
    canonicalToModel: Map<string, string>;
  }> {
    const catalog = this.deps.listToolCatalog();
    const filteredCatalog: ToolCatalogEntry[] = [];
    for (const tool of catalog) {
      if (input.webMode === "off" && isWebToolName(tool.toolName)) {
        continue;
      }
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
    localFileIntent?: boolean;
    priorToolRuns?: ChatToolRunRecord[];
  }): Promise<{
    record: ChatToolRunRecord;
    chunk?: ChatStreamChunk;
  }> {
    const preflight = this.preflightToolInvocation({
      toolName: input.toolName,
      rawArgs: input.rawArgs,
      userContent: input.input.content,
      webMode: input.input.webMode,
      localFileIntent: input.localFileIntent,
      priorToolRuns: input.priorToolRuns,
    });
    const startedAt = new Date().toISOString();
    const toolRunId = randomUUID();
    const created = this.deps.storage.chatToolRuns.create({
      toolRunId,
      turnId: input.turnId,
      sessionId: input.input.sessionId,
      toolName: preflight.toolName,
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
        toolName: preflight.toolName,
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
          toolName: preflight.toolName,
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

      if (MCP_BROWSER_FALLBACK_TOOL_NAMES.has(preflight.toolName)) {
        const finalized = await this.finalizeBrowserToolCall({
          created,
          turnInput: input.input,
          turnId: input.turnId,
          toolName: preflight.toolName,
          args: preflight.args,
          result: result.result,
        });
        if (finalized) {
          return finalized;
        }
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
      if (MCP_BROWSER_FALLBACK_TOOL_NAMES.has(preflight.toolName)) {
        const recovered = await this.finalizeBrowserToolCall({
          created,
          turnInput: input.input,
          turnId: input.turnId,
          toolName: preflight.toolName,
          args: preflight.args,
          error: (error as Error).message,
        });
        if (recovered) {
          return recovered;
        }
      }
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

  private async finalizeBrowserToolCall(input: {
    created: ChatToolRunRecord;
    turnInput: ChatAgentTurnInput;
    turnId: string;
    toolName: string;
    args: Record<string, unknown>;
    result?: Record<string, unknown>;
    error?: string;
  }): Promise<{
    record: ChatToolRunRecord;
    chunk: ChatStreamChunk;
  } | undefined> {
    const fallbackChain: Array<Record<string, unknown>> = [];
    let normalizedResult = input.result
      ? normalizeBrowserToolResult(input.toolName, input.result, {
          engineTier: "builtin",
          engineLabel: "Built-in browser",
        })
      : undefined;
    if (normalizedResult) {
      fallbackChain.push(buildBrowserFallbackChainEntry({
        toolName: input.toolName,
        engineTier: "builtin",
        engineLabel: "Built-in browser",
        result: normalizedResult,
        status: "executed",
      }));
    } else if (input.error) {
      fallbackChain.push(buildBrowserFallbackChainEntry({
        toolName: input.toolName,
        engineTier: "builtin",
        engineLabel: "Built-in browser",
        error: input.error,
        browserFailureClass: "runtime_error",
        status: "failed",
      }));
    }

    const classification = classifyBrowserToolResult(input.toolName, normalizedResult, input.error);
    if (fallbackChain.length > 0 && classification.failureClass) {
      const firstEntry = fallbackChain[0];
      if (firstEntry) {
        firstEntry.browserFailureClass = classification.failureClass;
        if (classification.error) {
          firstEntry.error = classification.error;
        }
        if (classification.failureClass !== "no_results") {
          firstEntry.status = "failed";
        }
      }
    }
    const fallbackAttempted = shouldAttemptBrowserFallback(input.toolName, classification.failureClass)
      && this.deps.invokeMcpTool
      && this.deps.listMcpBrowserFallbackTargets;

    if (fallbackAttempted) {
      const fallback = await this.tryBrowserFallbackAcrossMcpTiers({
        turnInput: input.turnInput,
        toolName: input.toolName,
        args: input.args,
        fallbackChain,
      });
      if (fallback) {
        const updated = this.deps.storage.chatToolRuns.patch(input.created.toolRunId, {
          status: "executed",
          result: fallback.result,
          finishedAt: new Date().toISOString(),
        });
        return {
          record: updated,
          chunk: {
            type: "tool_result",
            sessionId: input.turnInput.sessionId,
            turnId: input.turnId,
            toolRun: updated,
          },
        };
      }
    }

    if (!classification.failureClass && normalizedResult) {
      const updated = this.deps.storage.chatToolRuns.patch(input.created.toolRunId, {
        status: "executed",
        result: withBrowserFallbackChain(normalizedResult, fallbackChain),
        finishedAt: new Date().toISOString(),
      });
      return {
        record: updated,
        chunk: {
          type: "tool_result",
          sessionId: input.turnInput.sessionId,
          turnId: input.turnId,
          toolRun: updated,
        },
      };
    }

    if (classification.failureClass === "no_results" && normalizedResult) {
      const updated = this.deps.storage.chatToolRuns.patch(input.created.toolRunId, {
        status: "executed",
        result: withBrowserFallbackChain(
          {
            ...normalizedResult,
            browserFailureClass: classification.failureClass,
          },
          fallbackChain,
        ),
        finishedAt: new Date().toISOString(),
      });
      return {
        record: updated,
        chunk: {
          type: "tool_result",
          sessionId: input.turnInput.sessionId,
          turnId: input.turnId,
          toolRun: updated,
        },
      };
    }

    if (!classification.failureClass && !input.error) {
      return undefined;
    }

    const failureResult = withBrowserFallbackChain(
      {
        ...(normalizedResult ?? {}),
        engineTier: normalizedResult?.engineTier ?? "builtin",
        engineLabel: normalizedResult?.engineLabel ?? "Built-in browser",
        browserFailureClass: classification.failureClass ?? "runtime_error",
      },
      fallbackChain,
    );
    const updated = this.deps.storage.chatToolRuns.patch(input.created.toolRunId, {
      status: "failed",
      error: classification.error ?? input.error ?? "browser execution failed",
      result: failureResult,
      finishedAt: new Date().toISOString(),
    });
    return {
      record: updated,
      chunk: {
        type: "tool_result",
        sessionId: input.turnInput.sessionId,
        turnId: input.turnId,
        toolRun: updated,
      },
    };
  }

  private async tryBrowserFallbackAcrossMcpTiers(input: {
    turnInput: ChatAgentTurnInput;
    toolName: string;
    args: Record<string, unknown>;
    fallbackChain: Array<Record<string, unknown>>;
  }): Promise<{ result: Record<string, unknown> } | undefined> {
    const targets = this.deps.listMcpBrowserFallbackTargets?.() ?? [];
    for (const target of targets) {
      const resolvedToolName = resolveBrowserFallbackToolName(target, input.toolName);
      if (!resolvedToolName) {
        continue;
      }
      const response = await this.deps.invokeMcpTool?.({
        serverId: target.serverId,
        toolName: resolvedToolName,
        arguments: buildBrowserFallbackArguments(input.toolName, input.args),
        agentId: "assistant",
        sessionId: input.turnInput.sessionId,
      });
      if (!response) {
        continue;
      }
      const normalized = response.output
        ? normalizeMcpBrowserToolResult(input.toolName, response.output, {
            engineTier: target.tier,
            engineLabel: target.label,
            args: input.args,
          })
        : undefined;
      const classification = classifyBrowserToolResult(input.toolName, normalized, response.error);
      input.fallbackChain.push(buildBrowserFallbackChainEntry({
        toolName: resolvedToolName,
        engineTier: target.tier,
        engineLabel: target.label,
        result: normalized,
        error: response.error,
        browserFailureClass: classification.failureClass,
        status: response.ok && !classification.failureClass ? "executed" : "failed",
      }));
      if (!response.ok || !normalized || classification.failureClass) {
        continue;
      }
      return {
        result: withBrowserFallbackChain(normalized, input.fallbackChain),
      };
    }
    return undefined;
  }

  private preflightToolInvocation(input: {
    toolName: string;
    rawArgs: Record<string, unknown>;
    userContent: string;
    webMode: ChatWebMode;
    localFileIntent?: boolean;
    priorToolRuns?: ChatToolRunRecord[];
  }): {
    toolName: string;
    args: Record<string, unknown>;
    failureReason?: string;
    blockedReason?: string;
  } {
    const args = { ...input.rawArgs };
    let effectiveToolName = input.toolName;
    if (input.webMode === "off" && isWebToolName(input.toolName)) {
      return {
        toolName: effectiveToolName,
        args,
        blockedReason: "execution skipped: live web access is disabled because Web is set to Off for this chat",
      };
    }
    if (input.toolName === "browser.navigate" && typeof args.url === "string") {
      const promotedUrl = redirectSearchPortalNavigateUrl(args.url, input.userContent, input.priorToolRuns);
      if (promotedUrl && promotedUrl !== args.url) {
        args.url = promotedUrl;
      }
    }
    if (input.toolName === "browser.search") {
      const promotedUrl = inferBrowserNavigateUrlFromRepeatedSearches(input.userContent, input.priorToolRuns);
      if (promotedUrl) {
        effectiveToolName = "browser.navigate";
        return {
          toolName: effectiveToolName,
          args: {
            url: promotedUrl,
            maxChars: 6000,
          },
        };
      }
    }
    if (
      input.toolName === "browser.search"
      && (input.localFileIntent ?? false)
      && !detectExplicitWebLookupIntent(input.userContent)
    ) {
      return {
        toolName: effectiveToolName,
        args,
        blockedReason: "execution skipped: browser.search was suppressed because the prompt targets local files/project context",
      };
    }

    if ((input.toolName === "memory.write" || input.toolName === "memory.upsert") && !hasExplicitMemoryConsent(input.userContent)) {
      return {
        toolName: effectiveToolName,
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
      const inferred = inferToolArgValue(input.toolName, field, input.userContent)
        ?? inferToolArgValueFromRecentToolRuns(input.toolName, field, input.userContent, input.priorToolRuns);
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
            return { toolName: effectiveToolName, args };
          }
        }
        return {
          toolName: effectiveToolName,
          args,
          blockedReason: `execution skipped: ${input.toolName} requires query; unable to infer a safe query from the prompt`,
        };
      }
      return {
        toolName: effectiveToolName,
        args,
        failureReason: `execution error: ${field} is required`,
      };
    }

    return { toolName: effectiveToolName, args };
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
              "Write like a normal helpful chat response, not an incident report.",
              "Start with the direct answer or the single most important limitation.",
              "If key information is missing, ask at most two crisp follow-up questions.",
              "Mention tool limitations briefly in plain language.",
              "Do not use headings like Summary, Constraints, What I did instead, or What I need from you next unless the user explicitly asked for a structured report.",
              "If partial tool evidence exists, include only the most decision-useful parts.",
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
  return extractStructuredTextContent(message.content).trim();
}

function extractStructuredTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((part) => extractStructuredTextPart(part)).join("");
  }
  if (content && typeof content === "object") {
    return extractStructuredTextPart(content);
  }
  return "";
}

function extractStructuredTextPart(part: unknown): string {
  if (typeof part === "string") {
    return part;
  }
  if (!part || typeof part !== "object") {
    return "";
  }
  const value = part as Record<string, unknown>;
  if (typeof value.text === "string") {
    return value.text;
  }
  if (typeof value.content === "string") {
    return value.content;
  }
  if (typeof value.value === "string") {
    return value.value;
  }
  const nestedText = value.text;
  if (nestedText && typeof nestedText === "object") {
    const textRecord = nestedText as Record<string, unknown>;
    if (typeof textRecord.value === "string") {
      return textRecord.value;
    }
    if (typeof textRecord.text === "string") {
      return textRecord.text;
    }
    if (typeof textRecord.content === "string") {
      return textRecord.content;
    }
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

function buildEvidenceGroundingInstruction(): string {
  return [
    "Evidence grounding rules for this turn:",
    "- Base your answer strictly on the tool results provided. Do not add claims, statistics, or details not present in the retrieved data.",
    "- If the search results are shallow or only partially answer the question, say so explicitly. Keep the answer proportional to the evidence.",
    "- If you cannot verify a specific claim from the tool results, do not present it as verified. Use hedging language or omit it.",
    "- Cite only the few URLs that directly support the key claims you make. Do not append long source inventories.",
    "- If the results are insufficient to answer the question well, tell the user what was found and what is missing.",
  ].join("\n");
}

function withBrowserFallbackChain(
  result: Record<string, unknown>,
  fallbackChain: Array<Record<string, unknown>>,
): Record<string, unknown> {
  if (fallbackChain.length === 0) {
    return result;
  }
  return {
    ...result,
    fallbackChain: fallbackChain.map((entry) => ({ ...entry })),
  };
}

function normalizeBrowserToolResult(
  toolName: string,
  result: Record<string, unknown>,
  metadata: {
    engineTier: string;
    engineLabel: string;
  },
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    ...result,
    engineTier: metadata.engineTier,
    engineLabel: metadata.engineLabel,
  };
  if (toolName === "browser.search" && Array.isArray(result.results)) {
    normalized.results = result.results;
  }
  return normalized;
}

function normalizeMcpBrowserToolResult(
  toolName: string,
  output: Record<string, unknown>,
  metadata: {
    engineTier: string;
    engineLabel: string;
    args: Record<string, unknown>;
  },
): Record<string, unknown> {
  const structured = output.structuredContent;
  const base = structured && typeof structured === "object" && !Array.isArray(structured)
    ? structured as Record<string, unknown>
    : output;
  if (toolName === "browser.search") {
    const rawResults = Array.isArray(base.results)
      ? base.results
      : Array.isArray(output.results)
        ? output.results
        : [];
    return {
      ...base,
      ...output,
      results: rawResults,
      url: typeof base.url === "string" ? base.url : output.url,
      finalUrl: typeof base.finalUrl === "string" ? base.finalUrl : output.finalUrl,
      engineTier: metadata.engineTier,
      engineLabel: metadata.engineLabel,
    };
  }
  const textSnippet = readFirstString(
    base.textSnippet,
    base.bodySnippet,
    base.text,
    output.contentText,
    output.message,
  );
  const title = readFirstString(base.title, output.title);
  const finalUrl = readFirstString(base.finalUrl, output.finalUrl, base.url, output.url, metadata.args.url);
  return {
    ...base,
    ...output,
    url: readFirstString(base.url, output.url, metadata.args.url),
    finalUrl,
    title,
    textSnippet,
    status: readBrowserStatusNumber(base.status, output.status),
    engineTier: metadata.engineTier,
    engineLabel: metadata.engineLabel,
  };
}

function classifyBrowserToolResult(
  toolName: string,
  result: Record<string, unknown> | undefined,
  error?: string,
): {
  failureClass?: string;
  error?: string;
} {
  if (error) {
    return {
      failureClass: "runtime_error",
      error,
    };
  }
  if (!result) {
    return {
      failureClass: "unusable_output",
      error: "browser result was empty",
    };
  }
  const status = readBrowserStatusNumber(result.status);
  const normalizedText = readBrowserResultText(result).toLowerCase();
  const remoteBlockMarker = REMOTE_BLOCK_MARKERS.find((marker) => normalizedText.includes(marker));
  if (status === 401 || status === 403 || status === 429 || remoteBlockMarker) {
    return {
      failureClass: "remote_blocked",
      error: buildRemoteBlockedMessage(status, remoteBlockMarker),
    };
  }
  if (typeof status === "number" && status >= 400) {
    return {
      failureClass: "http_error",
      error: `source returned HTTP ${status}`,
    };
  }
  if (toolName === "browser.search") {
    const results = Array.isArray(result.results) ? result.results : [];
    if (results.length === 0) {
      return {
        failureClass: "no_results",
        error: "no usable search results were returned",
      };
    }
    return {};
  }
  const hasUsefulText = normalizedText.length >= 40;
  const hasUsefulUrl = typeof result.finalUrl === "string" || typeof result.url === "string";
  if (!hasUsefulText && !hasUsefulUrl) {
    return {
      failureClass: "unusable_output",
      error: "browser result did not include usable page content",
    };
  }
  return {};
}

function shouldAttemptBrowserFallback(toolName: string, failureClass?: string): boolean {
  if (!failureClass) {
    return false;
  }
  if (toolName === "browser.search") {
    return failureClass === "no_results" || failureClass === "remote_blocked" || failureClass === "http_error";
  }
  return failureClass === "remote_blocked"
    || failureClass === "http_error"
    || failureClass === "unusable_output"
    || failureClass === "runtime_error";
}

function resolveBrowserFallbackToolName(
  target: McpBrowserFallbackTarget,
  toolName: string,
): string | undefined {
  if (toolName === "browser.search") {
    return target.searchToolName;
  }
  if (toolName === "browser.navigate") {
    return target.navigateToolName ?? target.fetchToolName ?? target.extractToolName;
  }
  if (toolName === "browser.extract") {
    return target.extractToolName ?? target.fetchToolName ?? target.navigateToolName;
  }
  if (toolName === "http.get") {
    return target.fetchToolName ?? target.extractToolName ?? target.navigateToolName;
  }
  return undefined;
}

function buildBrowserFallbackArguments(
  toolName: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (toolName === "browser.search") {
    return {
      query: args.query,
      maxResults: args.maxResults,
    };
  }
  return {
    url: args.url,
    maxChars: args.maxChars,
    timeoutMs: args.timeoutMs,
  };
}

function buildBrowserFallbackChainEntry(input: {
  toolName: string;
  engineTier: string;
  engineLabel: string;
  result?: Record<string, unknown>;
  error?: string;
  browserFailureClass?: string;
  status: "executed" | "failed";
}): Record<string, unknown> {
  return {
    toolName: input.toolName,
    engineTier: input.engineTier,
    engineLabel: input.engineLabel,
    status: input.status,
    url: extractBrowserToolUrl(input.result),
    finalUrl: readFirstString(input.result?.finalUrl, input.result?.url),
    httpStatus: readBrowserStatusNumber(input.result?.status),
    browserFailureClass: input.browserFailureClass,
    error: input.error,
  };
}

function buildRemoteBlockedMessage(status?: number, marker?: string): string {
  const reason = marker?.includes("cloudflare")
    ? "Cloudflare"
    : marker?.includes("captcha")
      ? "captcha challenge"
      : marker?.includes("javascript")
        ? "browser challenge"
        : "automation block";
  if (typeof status === "number") {
    return `remote site blocked automation (${reason} ${status})`;
  }
  return `remote site blocked automation (${reason})`;
}

function readBrowserResultText(result: Record<string, unknown>): string {
  return [
    readFirstString(result.title),
    readFirstString(result.textSnippet),
    readFirstString(result.bodySnippet),
    readFirstString(result.contentText),
    readFirstString(result.message),
  ].filter(Boolean).join(" ");
}

function readBrowserStatusNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function extractBrowserToolUrl(result: Record<string, unknown> | undefined): string | undefined {
  if (!result) {
    return undefined;
  }
  return readFirstString(result.finalUrl, result.url);
}

function readFirstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
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
  return hasLiveDataKeywords(content.toLowerCase());
}

function detectExplicitWebLookupIntent(content: string): boolean {
  // P1-8: Use only explicit web phrases, not all live-data keywords.
  const lower = content.toLowerCase();
  return EXPLICIT_WEB_PHRASES.some((phrase) => lower.includes(phrase));
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
  const keywordRegex = /\b(latest|today|right now|news|price|weather|recent|recently|lately|this week|this weekend|this month|coming out|opening|releasing|release schedule)\b/i;
  const matching = clauses.filter((clause) => keywordRegex.test(clause));
  const selected = matching.at(-1) ?? clauses.at(-1) ?? normalized;
  const cleaned = selected
    .replace(/^(hi|hello|hey)\b[^a-zA-Z0-9]*/i, "")
    .replace(/^(?:please\s+)?(?:look|search|browse)\s+(?:online|the web|web|internet)\b(?:\s+(?:for|about|on))?(?:\s+and)?\s*/i, "")
    .replace(/^(?:please\s+)?(?:tell|show|give)\s+me\b(?:\s+the)?\s*/i, "")
    .trim();
  if (/\b(?:what|which)\s+happened\s+today\b/i.test(cleaned) || /\b(?:things|stories|events)\s+that\s+happened\s+today\b/i.test(cleaned)) {
    return "top news headlines today";
  }
  return cleaned || normalized;
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
    ? "If you share your `docker-compose.yml` contents, I can list services and rank operational risk by exposure, privilege, and data sensitivity."
    : "If you share the relevant file content, I can give you a concrete analysis instead of a generic answer.";
  return [
    "I can't directly access your local project files from this runtime -- no filesystem read path was available for this turn.",
    "",
    "To help, I'd need you to either paste the file contents (or key sections) or run a local command to print the file and share the output.",
    "",
    composeHint,
  ].join("\n");
}

function buildClarificationPromptIfNeeded(userPrompt: string): string | undefined {
  const normalized = userPrompt.toLowerCase();
  const questions: string[] = [];

  // Detect estimation prompts with ambiguous scope.
  const isEstimate = /\b(estimate|estimation|how many|count|number of|size of)\b/.test(normalized);
  const hasVagueGeography = /\b(the|this|my|our)\s+(area|region|city|county|metro|state|country|neighborhood)\b/.test(normalized)
    || /\b(here|near me|locally|nearby)\b/.test(normalized);
  if (isEstimate && hasVagueGeography) {
    questions.push("What geographic area do you mean exactly: city, metro, county, state, or country?");
  }

  // Detect subjective/qualitative terms that need an operational definition.
  const hasSubjectiveTerm = /\b(genuinely|chronic(?:ally)?|true|real|actual)\s+\w+/.test(normalized)
    && /\b(lonely|isolated|engaged|active|committed|poor|wealthy|healthy)\b/.test(normalized);
  if (isEstimate && hasSubjectiveTerm) {
    questions.push("How are you defining that qualifier -- what threshold or criteria should I use?");
  }

  // Detect timeframe ambiguity for trend or comparison prompts.
  const isTrend = /\b(trend|growth|change|decline|increase|decrease|over time)\b/.test(normalized);
  const hasVagueTimeframe = /\b(recent|recently|lately|last few|past few)\b/.test(normalized)
    && !/\b(last|past)\s+\d+\s+(year|month|week|day|quarter)/i.test(normalized);
  if (isTrend && hasVagueTimeframe) {
    questions.push("What timeframe should I use -- last 12 months, 5 years, or something else?");
  }

  if (questions.length === 0) {
    return undefined;
  }
  return [
    "I need a quick clarification before answering that responsibly:",
    ...questions.map((question) => `- ${question}`),
    "Once you answer, I can give you a grounded response.",
  ].join("\n");
}

function buildClarificationFollowUpIfNeeded(
  userPrompt: string,
  historyMessages: ChatCompletionRequest["messages"],
): string | undefined {
  const pending = readPendingClarification(historyMessages);
  if (!pending || pending.length === 0) {
    return undefined;
  }
  const normalizedAnswer = userPrompt.toLowerCase();
  const answeredAny = pending.some((question) => looksLikeClarificationAnswer(normalizedAnswer, question));
  if (!answeredAny) {
    return looksLikeFreshStandalonePrompt(userPrompt) ? undefined : [
      "I still need a quick clarification before answering that responsibly:",
      ...pending.map((question) => `- ${question}`),
      "Once you answer, I can give you a grounded response.",
    ].join("\n");
  }
  const remaining = pending.filter((question) => !looksLikeClarificationAnswer(normalizedAnswer, question));
  if (remaining.length === 0) {
    return undefined;
  }
  return [
    remaining.length < pending.length
      ? "Got it. I still need one more detail before answering that responsibly:"
      : "I still need a quick clarification before answering that responsibly:",
    ...remaining.map((question) => `- ${question}`),
    "Once you answer, I can give you a grounded response.",
  ].join("\n");
}

function readPendingClarification(
  historyMessages: ChatCompletionRequest["messages"],
): string[] | undefined {
  for (let index = historyMessages.length - 1; index >= 0; index -= 1) {
    const message = historyMessages[index] as unknown as Record<string, unknown>;
    if (message.role !== "assistant") {
      continue;
    }
    const content = extractMessageContent(message);
    if (!content.includes("answering that responsibly")) {
      return undefined;
    }
    // Extract the bullet-point questions from our prior clarification.
    const questions = content
      .split("\n")
      .filter((line) => line.startsWith("- ") && line.endsWith("?"))
      .map((line) => line.slice(2));
    if (questions.length > 0) {
      return questions;
    }
    return undefined;
  }
  return undefined;
}

function looksLikeFreshStandalonePrompt(userPrompt: string): boolean {
  const trimmed = userPrompt.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (/^(never mind|nevermind|ignore that|different question)\b/i.test(trimmed)) {
    return true;
  }
  if (trimmed.endsWith("?")) {
    return true;
  }
  return /^(what|who|when|where|why|how|compare|explain|summarize|estimate|tell me|look online|search online|browse the web|use internet|give me|write|draft|analyze|analyse|review|help me|find)\b/i.test(trimmed);
}

function buildLiveDataSettingsConflictMessage(input: {
  liveDataIntent: boolean;
  timeIntent: boolean;
  localFileIntent: boolean;
  webMode: ChatWebMode;
  toolAutonomy: ChatAgentTurnInput["toolAutonomy"];
}): string | undefined {
  if (!input.liveDataIntent || input.timeIntent || input.localFileIntent) {
    return undefined;
  }
  if (input.webMode === "off") {
    return [
      "I can't fetch live web data for that because Web is set to Off for this chat.",
      "Switch Web to Auto, Quick, or Deep and resend if you want a grounded current-events answer, or ask for a non-live summary instead.",
    ].join(" ");
  }
  if (input.toolAutonomy === "manual") {
    return [
      "I can't fetch live web data for that because tool autonomy is set to Manual for this chat, so I can't run the browser tools needed to verify current information.",
      "Switch tool autonomy to Safe Auto and resend, or ask a non-live question instead.",
    ].join(" ");
  }
  return undefined;
}

function isWebToolName(toolName: string): boolean {
  return WEB_TOOL_NAMES.has(toolName);
}

function looksLikeClarificationAnswer(answer: string, question: string): boolean {
  // Geography questions
  if (question.includes("geographic area")) {
    return /\b(city|metro|county|state|country|region|neighborhood|borough|district|zip|postal)\b/.test(answer)
      || /\b(in|for|around|within|near)\s+[A-Z]/i.test(answer);
  }
  // Definition/qualifier questions
  if (question.includes("threshold") || question.includes("criteria") || question.includes("defining")) {
    return /\b(defined as|definition|means|self-reported|threshold|criteria|measured)\b/.test(answer)
      || /["""]/.test(answer);
  }
  // Timeframe questions
  if (question.includes("timeframe")) {
    return /\b(year|month|week|day|quarter|since|from|period|window)\b/.test(answer)
      || /\d+\s*(year|month|week|day|quarter)/i.test(answer);
  }
  return false;
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

function isRetryableToolFailure(errorText: string | undefined): boolean {
  if (!errorText) {
    return false;
  }
  const normalized = normalizeFailureSignature(errorText);
  return (
    normalized.includes("timeout")
    || normalized.includes("timed out")
    || normalized.includes("econnreset")
    || normalized.includes("etimedout")
    || normalized.includes("ehostunreach")
    || normalized.includes("network")
    || normalized.includes("temporarily unavailable")
    || normalized.includes("429")
    || normalized.includes("rate limit")
  );
}

function shouldTripToolCircuitBreakerImmediately(errorText: string | undefined): boolean {
  if (!errorText) {
    return false;
  }
  const normalized = normalizeFailureSignature(errorText);
  return normalized.startsWith("execution error:") && normalized.endsWith(" is required");
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

function inferToolArgValueFromRecentToolRuns(
  toolName: string,
  field: string,
  userContent: string,
  toolRuns: ChatToolRunRecord[] | undefined,
): unknown {
  if (field !== "url" || !toolRuns || toolRuns.length === 0) {
    return undefined;
  }
  if (toolName !== "browser.navigate" && toolName !== "browser.extract" && toolName !== "http.get") {
    return undefined;
  }
  return inferRecentBrowserVisitedUrl(toolRuns)
    ?? selectBestRecentBrowserResultUrl(userContent, toolRuns, 3);
}

function inferBrowserNavigateUrlFromRepeatedSearches(
  userContent: string,
  toolRuns: ChatToolRunRecord[] | undefined,
): string | undefined {
  if (!toolRuns || toolRuns.length === 0 || !detectLiveDataIntent(userContent)) {
    return undefined;
  }
  const executedSearchCount = toolRuns.filter((run) => run.toolName === "browser.search" && run.status === "executed").length;
  if (executedSearchCount < 1) {
    return undefined;
  }
  const alreadyOpenedContent = toolRuns.some((run) => (
    ((run.toolName === "browser.extract" || run.toolName === "http.get") && run.status === "executed")
    || (run.toolName === "browser.navigate" && run.status === "executed" && hasUsefulVisitedBrowserUrl(run))
  ));
  if (alreadyOpenedContent) {
    return undefined;
  }
  return selectBestRecentBrowserResultUrl(userContent, toolRuns, 3);
}

function redirectSearchPortalNavigateUrl(
  requestedUrl: string,
  userContent: string,
  toolRuns: ChatToolRunRecord[] | undefined,
): string | undefined {
  if (!toolRuns || toolRuns.length === 0) {
    return undefined;
  }
  try {
    const parsed = new URL(requestedUrl);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    if (!isSearchPortalHost(hostname) && !isLikelyLandingOrResultsPath(pathname)) {
      return undefined;
    }
  } catch {
    return undefined;
  }
  return selectBestRecentBrowserResultUrl(userContent, toolRuns, 3);
}

interface BrowserResultCandidate {
  url: string;
  title?: string;
  snippet?: string;
  hostname: string;
  path: string;
  sourceRunIndex: number;
}

const SEARCH_RESULT_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "lately",
  "latest",
  "me",
  "near",
  "news",
  "now",
  "of",
  "on",
  "recent",
  "recently",
  "right",
  "tell",
  "the",
  "today",
  "what",
  "whats",
  "what's",
  "with",
]);

const SEARCH_PORTAL_HOST_PATTERNS = [
  /^google\./i,
  /^www\.google\./i,
  /^bing\.com$/i,
  /^www\.bing\.com$/i,
  /^([a-z0-9-]+\.)?duckduckgo\.com$/i,
  /^search\.yahoo\.com$/i,
  /^www\.search\.yahoo\.com$/i,
];

function selectBestRecentBrowserResultUrl(
  userContent: string,
  toolRuns: ChatToolRunRecord[],
  minimumScore: number,
): string | undefined {
  const poisonedHosts = collectPoisonedBrowserHosts(toolRuns);
  const candidates = collectRecentBrowserSearchCandidates(toolRuns, poisonedHosts);
  if (candidates.length === 0) {
    return undefined;
  }
  const derivedQuery = deriveLiveDataQuery(userContent);
  const queryTokens = tokenizeBrowserSearchText(derivedQuery);
  const newsLike = isLikelyNewsOrCurrentEventsQuery(userContent);
  let best: { candidate: BrowserResultCandidate; score: number } | undefined;
  for (const candidate of candidates) {
    const score = scoreBrowserResultCandidate(candidate, derivedQuery, queryTokens, newsLike);
    if (!best || score > best.score) {
      best = { candidate, score };
    }
  }
  if (!best || best.score < minimumScore) {
    return undefined;
  }
  return best.candidate.url;
}

function collectRecentBrowserSearchCandidates(
  toolRuns: ChatToolRunRecord[],
  poisonedHosts: Set<string>,
): BrowserResultCandidate[] {
  for (let index = toolRuns.length - 1; index >= 0; index -= 1) {
    const run = toolRuns[index];
    if (!run || run.toolName !== "browser.search" || run.status !== "executed" || !run.result || typeof run.result !== "object") {
      continue;
    }
    const result = run.result as Record<string, unknown>;
    if (!Array.isArray(result.results)) {
      continue;
    }
    const candidates: BrowserResultCandidate[] = [];
    for (const raw of result.results) {
      const value = raw as Record<string, unknown>;
      if (typeof value.url !== "string" || !/^https?:\/\//i.test(value.url)) {
        continue;
      }
      try {
        const parsed = new URL(value.url);
        const hostname = parsed.hostname.toLowerCase();
        if (poisonedHosts.has(hostname)) {
          continue;
        }
        candidates.push({
          url: value.url,
          title: typeof value.title === "string" ? value.title : undefined,
          snippet: typeof value.snippet === "string" ? value.snippet : undefined,
          hostname,
          path: parsed.pathname.toLowerCase(),
          sourceRunIndex: index,
        });
      } catch {
        continue;
      }
    }
    if (candidates.length > 0) {
      return candidates;
    }
  }
  return [];
}

function collectPoisonedBrowserHosts(toolRuns: ChatToolRunRecord[]): Set<string> {
  const poisoned = new Set<string>();

  function addPoisonedFromResult(result: Record<string, unknown>, fallbackUrl?: string): void {
    const failureClass = typeof result.browserFailureClass === "string" ? result.browserFailureClass : undefined;
    if (!failureClass || failureClass === "no_results") {
      return;
    }
    const url = extractBrowserToolUrl(result) ?? fallbackUrl;
    if (!url) {
      return;
    }
    try {
      poisoned.add(new URL(url).hostname.toLowerCase());
    } catch {
      // ignore malformed URLs
    }
  }

  for (const run of toolRuns) {
    if (!run || !run.result || typeof run.result !== "object") {
      continue;
    }
    if (run.status !== "failed" && run.status !== "blocked") {
      continue;
    }
    const result = run.result as Record<string, unknown>;
    const fallbackUrl = typeof run.args?.url === "string" ? run.args.url : undefined;

    // Check top-level result
    addPoisonedFromResult(result, fallbackUrl);

    // P2-8: Also scan fallback chain entries within the result.
    const fallbackChain = Array.isArray(result.fallbackChain) ? result.fallbackChain : [];
    for (const entry of fallbackChain) {
      if (entry && typeof entry === "object") {
        addPoisonedFromResult(entry as Record<string, unknown>, fallbackUrl);
      }
    }
  }
  return poisoned;
}

function inferBlockedSourceFailure(
  toolRuns: ChatToolRunRecord[],
): { host?: string; failureClass: string } | undefined {
  for (let index = toolRuns.length - 1; index >= 0; index -= 1) {
    const run = toolRuns[index];
    if (!run?.result || typeof run.result !== "object") {
      continue;
    }
    const result = run.result as Record<string, unknown>;
    const topLevelFailure = readBlockedSourceFailure(result);
    if (topLevelFailure) {
      return {
        host: readBlockedSourceHost(result, run.args),
        failureClass: topLevelFailure,
      };
    }
    const fallbackChain = Array.isArray(result.fallbackChain)
      ? result.fallbackChain
      : [];
    for (let chainIndex = fallbackChain.length - 1; chainIndex >= 0; chainIndex -= 1) {
      const entry = fallbackChain[chainIndex];
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const record = entry as Record<string, unknown>;
      const failureClass = readBlockedSourceFailure(record);
      if (!failureClass) {
        continue;
      }
      return {
        host: readBlockedSourceHost(record),
        failureClass,
      };
    }
  }
  return undefined;
}

function readBlockedSourceFailure(result: Record<string, unknown>): string | undefined {
  const failureClass = typeof result.browserFailureClass === "string"
    ? result.browserFailureClass
    : undefined;
  if (failureClass === "remote_blocked" || failureClass === "http_error") {
    return failureClass;
  }
  return undefined;
}

function readBlockedSourceHost(
  result: Record<string, unknown>,
  args?: Record<string, unknown>,
): string | undefined {
  const url = extractBrowserToolUrl(result)
    ?? (typeof args?.url === "string" ? args.url : undefined);
  if (!url) {
    return undefined;
  }
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function inferRecentBrowserVisitedUrl(toolRuns: ChatToolRunRecord[]): string | undefined {
  for (let index = toolRuns.length - 1; index >= 0; index -= 1) {
    const run = toolRuns[index];
    if (!run || run.status !== "executed" || !run.result || typeof run.result !== "object") {
      continue;
    }
    const usefulUrl = extractUsefulVisitedBrowserUrl(run.result as Record<string, unknown>);
    if (usefulUrl) {
      return usefulUrl;
    }
  }
  return undefined;
}

function hasUsefulVisitedBrowserUrl(run: ChatToolRunRecord): boolean {
  return Boolean(run.result && typeof run.result === "object" && extractUsefulVisitedBrowserUrl(run.result as Record<string, unknown>));
}

function extractUsefulVisitedBrowserUrl(result: Record<string, unknown>): string | undefined {
  const candidateValues = [result.finalUrl, result.url];
  for (const value of candidateValues) {
    if (typeof value !== "string" || !/^https?:\/\//i.test(value)) {
      continue;
    }
    try {
      const parsed = new URL(value);
      const hostname = parsed.hostname.toLowerCase();
      const pathname = parsed.pathname.toLowerCase();
      if (isSearchPortalHost(hostname) || isLikelyLandingOrResultsPath(pathname)) {
        continue;
      }
      return value;
    } catch {
      continue;
    }
  }
  return undefined;
}

function tokenizeBrowserSearchText(value: string): string[] {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return [];
  }
  const tokens = normalized
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !SEARCH_RESULT_STOPWORDS.has(token));
  return [...new Set(tokens)];
}

function normalizeBrowserSearchText(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s/:-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countMatchingQueryTokens(haystack: string, queryTokens: string[]): number {
  if (!haystack || queryTokens.length === 0) {
    return 0;
  }
  return queryTokens.reduce((count, token) => (haystack.includes(token) ? count + 1 : count), 0);
}

function isSearchPortalHost(hostname: string): boolean {
  return SEARCH_PORTAL_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

function isLikelyLandingOrResultsPath(pathname: string): boolean {
  return /\/(search|results|topics|topic|tag|tags)(\/|$)/i.test(pathname);
}

function isLikelyNewsOrCurrentEventsQuery(value: string): boolean {
  const normalized = value.toLowerCase();
  return /\b(latest|today|right now|news|recent|recently|lately)\b/.test(normalized)
    || /\bcurrent\s+(news|events|headlines?|score|scores|markets?)\b/.test(normalized)
    || normalized.includes("what's going on with")
    || normalized.includes("whats going on with");
}

function scoreBrowserResultCandidate(
  candidate: BrowserResultCandidate,
  query: string,
  queryTokens: string[],
  newsLike: boolean,
): number {
  const normalizedTitle = normalizeBrowserSearchText(candidate.title);
  const normalizedSnippet = normalizeBrowserSearchText(candidate.snippet);
  const normalizedPath = normalizeBrowserSearchText(candidate.path);
  const normalizedQuery = normalizeBrowserSearchText(query);
  const titleMatches = countMatchingQueryTokens(normalizedTitle, queryTokens);
  const snippetMatches = countMatchingQueryTokens(normalizedSnippet, queryTokens);
  const pathMatches = countMatchingQueryTokens(normalizedPath, queryTokens);
  let score = 0;
  if (normalizedQuery.length >= 8 && normalizedTitle.includes(normalizedQuery)) {
    score += 5;
  }
  if (titleMatches >= 2) {
    score += 5;
  } else if (titleMatches === 1) {
    score += 2;
  }
  if (snippetMatches >= 2) {
    score += 3;
  } else if (snippetMatches === 1) {
    score += 1;
  }
  if (pathMatches >= 2) {
    score += 2;
  } else if (pathMatches === 1) {
    score += 1;
  }
  if (!candidate.title && !candidate.snippet) {
    score -= 3;
  }
  if (isSearchPortalHost(candidate.hostname)) {
    score -= 5;
  }
  if (isLikelyLandingOrResultsPath(candidate.path)) {
    score -= 2;
  }
  if (newsLike) {
    if (/\/(news|politics|article|story)(\/|$)/i.test(candidate.path) || /\b(news|times|post|reuters|apnews|axios|politico|npr|cnn|abc|nbc|cbs|fox)\b/i.test(candidate.hostname)) {
      score += 2;
    }
  } else if (!isSearchPortalHost(candidate.hostname)) {
    score += 1;
  }
  score -= candidate.sourceRunIndex * 0.001;
  return score;
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
  if (/\b(latest|today|news|price|weather|summarize|summary|extract|analyze)\b/i.test(text)) {
    score += 20;
  }
  if (/\bcurrent\s+(news|events|weather|forecast|temperature|price|prices|stock|stocks|market|markets|headlines?|score|scores|conditions?|traffic)\b/i.test(text)) {
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
    "I can't determine a root cause yet because the log blob wasn't pasted. Here's what I'd look for once you share it:",
    "",
    "Common root-cause patterns: timeout/retry storms (repeated 429/503), auth mismatches (401/403 or token refresh), or schema drift after a deploy (parse errors, unknown fields).",
    "",
    "To triage quickly, I need:",
    "1. The first and last fatal/exception blocks from the same incident window.",
    "2. About 20 lines of context before and after the first exception.",
    "3. The service name and timezone so I can correlate timestamps.",
    "",
    "Ideal format: `<timestamp> service=<name> level=ERROR request_id=<id> error_code=<code> message=<msg>` -- or just paste the first exception line plus the line immediately above it.",
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
    .map((item) => `${item.toolName}: ${truncateJson(item.result, 180)}`);
  const lines = [
    `I couldn't finish that cleanly because ${reason ?? "the tool flow did not converge to a complete answer"}.`,
  ];
  if (failures.length > 0) {
    lines.push(`Latest tool issue: ${failures[0]?.replace(/^- /, "")}`);
  }
  if (evidence.length > 0) {
    lines.push(`Useful partial result: ${evidence[0]}`);
  }
  lines.push("If you want me to retry, send explicit query, URL, or file details.");
  const querySeed = inferQueryFromPrompt(userPrompt) ?? deriveLiveDataQuery(userPrompt);
  if (querySeed) {
    lines.push(`Best retry seed: ${querySeed}`);
  }
  return lines.join("\n\n");
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
  const appendix = buildToolFailureAppendix(toolRuns);
  if (!appendix) {
    return content;
  }
  const trimmed = content.trim();
  const failedOrBlocked = toolRuns.filter((run) => run.status === "failed" || run.status === "blocked");
  if (mentionsToolFailureConstraints(trimmed, failedOrBlocked)) {
    return trimmed;
  }
  if (!trimmed) {
    return appendix;
  }
  return `${trimmed}\n\n${appendix}`;
}

function mentionsToolFailureConstraints(content: string, failedRuns: ChatToolRunRecord[]): boolean {
  const normalized = content.toLowerCase();
  const hasGenericMention = normalized.includes("\nconstraints")
    || normalized.includes("## constraints")
    || normalized.includes("constraints:")
    || normalized.includes("tool failures")
    || normalized.includes("what i need from you next")
    || normalized.includes("tool issue")
    || normalized.includes("may be incomplete");
  if (hasGenericMention) {
    return true;
  }
  // If the LLM already referenced every failed tool by name, skip the appendix.
  if (failedRuns.length > 0) {
    const allToolsMentioned = failedRuns.every((run) => {
      const toolBaseName = run.toolName.split(".").pop() ?? run.toolName;
      return normalized.includes(toolBaseName.toLowerCase());
    });
    if (allToolsMentioned) {
      return true;
    }
  }
  return false;
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

function formatToolLabel(toolName: string): string {
  const shortName = toolName.split(".").pop() ?? toolName;
  return shortName.replaceAll("_", " ");
}

function buildToolFailureAppendix(toolRuns: ChatToolRunRecord[]): string | undefined {
  const failedOrBlocked = toolRuns.filter((run) => run.status === "failed" || run.status === "blocked");
  if (failedOrBlocked.length === 0) {
    return undefined;
  }
  const uniqueTools = [...new Set(failedOrBlocked.map((run) => formatToolLabel(run.toolName)))];
  const opening = uniqueTools.length === 1
    ? `Note: ${uniqueTools[0]} failed while I was working, so parts of this answer may be incomplete.`
    : "Note: a few tools failed while I was working, so parts of this answer may be incomplete.";
  return [
    opening,
    "",
    "If you want, I can retry with a narrower query or explicit source details.",
  ].join("\n");
}

function buildToolFailureFallbackMessage(
  userPrompt: string,
  toolRuns: ChatToolRunRecord[],
  reason: string,
): string {
  const blockedSource = inferBlockedSourceFailure(toolRuns);
  const strongestLeads = recoverTitleUrlItems(toolRuns, 3);
  if (strongestLeads.length > 0) {
    return [
      blockedSource
        ? `A source blocked automated browsing${blockedSource.host ? ` on ${blockedSource.host}` : ""}, but these look like the strongest leads so far:`
        : "I hit a tool issue before I could finish a full pass, but these look like the strongest leads so far:",
      "",
      ...strongestLeads.map((item, index) => `${index + 1}. ${formatRecoveredSearchLead(item)}`),
      "",
      "If you want, tell me which lead to keep digging into, or retry with a narrower query.",
    ].join("\n");
  }

  const lastFailure = toolRuns
    .filter((item) => item.status === "failed" || item.status === "blocked")
    .at(-1);
  const evidence = toolRuns
    .filter((item) => item.status === "executed" && item.result)
    .slice(-2)
    .map((item) => `${formatToolLabel(item.toolName)}: ${truncateJson(item.result, 160)}`);
  const fallbackQuery = deriveLiveDataQuery(userPrompt);
  const intro = blockedSource
    ? `A source blocked automated browsing${blockedSource.host ? ` on ${blockedSource.host}` : ""}, so I stopped retrying that host.`
    : reason.toLowerCase().includes("non-recoverable tool failure")
    ? "I hit a tool issue that was not safe to keep retrying."
    : "I hit the same tool issue repeatedly, so I stopped retrying to keep the chat moving.";
  const lines = [
    intro,
  ];
  if (lastFailure) {
    lines.push(`The blocker was in ${formatToolLabel(lastFailure.toolName)}.`);
  }
  if (evidence.length > 0) {
    lines.push(`Most useful partial result so far: ${evidence[0]}`);
  } else {
    lines.push("I do not have a reliable enough partial answer yet.");
  }
  lines.push("If you want another pass, send a narrower query or a specific URL/path.");
  if (fallbackQuery) {
    lines.push(`Suggested retry: ${fallbackQuery}`);
  }
  return lines.join("\n\n");
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

function resolveChatExecutionBudget(
  input: Pick<ChatAgentTurnInput, "webMode" | "thinkingLevel">,
): ChatExecutionBudget {
  const defaultMaxTokens = defaultThinkingTokens(input.thinkingLevel);
  if (input.webMode === "deep") {
    return {
      turnBudgetMs: 120000,
      completionTimeoutMs: 90000,
      maxToolLoops: MAX_TOOL_LOOPS,
      maxToolRunsPerTurn: MAX_TOOL_RUNS_PER_TURN,
      searchMaxResults: 8,
      maxTokens: Math.max(defaultMaxTokens ?? 900, 1200),
    };
  }
  if (input.webMode === "quick") {
    return {
      turnBudgetMs: 18000,
      completionTimeoutMs: 12000,
      maxToolLoops: 2,
      maxToolRunsPerTurn: 3,
      searchMaxResults: 4,
      maxTokens: Math.min(defaultMaxTokens ?? 600, 600),
    };
  }
  if (input.webMode === "off") {
    return {
      turnBudgetMs: 22000,
      completionTimeoutMs: 15000,
      maxToolLoops: 2,
      maxToolRunsPerTurn: 4,
      searchMaxResults: 0,
      maxTokens: Math.min(defaultMaxTokens ?? 700, 800),
    };
  }
  return {
    turnBudgetMs: 28000,
    completionTimeoutMs: 18000,
    maxToolLoops: 3,
    maxToolRunsPerTurn: 5,
    searchMaxResults: 5,
    maxTokens: Math.min(defaultMaxTokens ?? 900, 1100),
  };
}

function createTurnBudgetDeadline(turnBudgetMs: number): number {
  return Date.now() + turnBudgetMs;
}

function ensureChatTurnBudgetRemaining(
  deadline: number,
  webMode: ChatWebMode,
  turnBudgetMs: number,
): number {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    throw new ChatTurnBudgetExceededError(webMode, turnBudgetMs);
  }
  return remaining;
}

function buildTurnBudgetExceededReason(webMode: ChatWebMode, turnBudgetMs: number): string {
  if (webMode === "deep") {
    return `the deep-research response budget ran out after ${Math.floor(turnBudgetMs / 1000)} seconds`;
  }
  return `the response budget ran out after ${Math.floor(turnBudgetMs / 1000)} seconds to keep chat responsive`;
}

function throwIfChatTurnCancelled(input: Pick<ChatAgentTurnInput, "signal">): void {
  if (!input.signal?.aborted) {
    return;
  }
  const reason = input.signal.reason;
  if (reason instanceof Error) {
    throw reason;
  }
  throw new Error("Chat turn cancelled.");
}

function isChatTurnAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  const name = error.name.toLowerCase();
  const message = error.message.toLowerCase();
  return name.includes("abort")
    || name.includes("cancel")
    || message.includes("aborted")
    || message.includes("cancelled");
}

function buildChatTurnFailureRecord(
  failureClass: ChatTurnFailureClass,
  message: string,
  recommendedAction: ChatTurnRecoveryAction = getChatTurnRecoveryAction(failureClass),
): ChatTurnFailureRecord {
  return {
    failureClass,
    message,
    retryable: failureClass !== "auth_required",
    recommendedAction,
  };
}

function classifyChatTurnFailure(input: {
  error?: unknown;
  toolRuns: ChatToolRunRecord[];
}): ChatTurnFailureClass {
  if (hasToolBlockedFailure(input.toolRuns)) {
    return "tool_blocked";
  }
  if (hasToolFailedFailure(input.toolRuns)) {
    return "tool_failed";
  }
  const normalizedMessage = input.error instanceof Error ? input.error.message.toLowerCase() : "";
  if (
    normalizedMessage.includes("timed out")
    || normalizedMessage.includes("timeout")
  ) {
    return "provider_timeout";
  }
  if (
    normalizedMessage.includes("unauthorized")
    || normalizedMessage.includes("forbidden")
    || normalizedMessage.includes("api key")
    || normalizedMessage.includes("401")
    || normalizedMessage.includes("403")
    || normalizedMessage.includes("auth")
  ) {
    return "auth_required";
  }
  if (
    normalizedMessage.includes("network")
    || normalizedMessage.includes("fetch failed")
    || normalizedMessage.includes("socket")
    || normalizedMessage.includes("econnreset")
    || normalizedMessage.includes("enotfound")
  ) {
    return "network_interrupted";
  }
  return "unknown";
}

function hasToolBlockedFailure(toolRuns: ChatToolRunRecord[]): boolean {
  return toolRuns.some((run) => {
    if (run.status === "blocked") {
      return true;
    }
    const failureClass = typeof run.result?.browserFailureClass === "string"
      ? run.result.browserFailureClass
      : undefined;
    return failureClass === "remote_blocked" || failureClass === "http_error";
  });
}

function hasToolFailedFailure(toolRuns: ChatToolRunRecord[]): boolean {
  return toolRuns.some((run) => run.status === "failed");
}

function buildUserSafeFailureMessage(failure: ChatTurnFailureRecord): string {
  switch (failure.failureClass) {
    case "provider_timeout":
      return "The model request timed out before completion. Retry once, or switch to a lighter mode for faster results.";
    case "network_interrupted":
      return "The request was interrupted before the turn could finish. Retry once and check the gateway connection if it happens again.";
    case "tool_blocked":
      return "A required source blocked automated access. Retry with a narrower request, or continue from the strongest leads already gathered.";
    case "tool_failed":
      return "A required tool failed before the turn could finish. Retry once, or narrow the request so it can complete without that tool path.";
    case "auth_required":
      return "The selected provider or integration needs valid auth before this turn can continue. Reconnect auth or choose another provider.";
    case "budget_exceeded":
      return "This turn hit the current execution budget before a full pass finished. Continue from the strongest leads or switch to a deeper mode.";
    case "approval_required":
      return "This turn is waiting for approval before it can continue.";
    default:
      return "This turn failed before completion. Retry once, or narrow the request so the next pass can finish cleanly.";
  }
}

function buildTurnBudgetExceededFallbackMessage(
  input: ChatAgentTurnInput,
  toolRuns: ChatToolRunRecord[],
  turnBudgetMs: number,
): string {
  const searchFallback = buildSearchResultBudgetFallback(
    input.webMode,
    toolRuns,
  );
  if (searchFallback) {
    return searchFallback;
  }
  if (toolRuns.length > 0) {
    return buildDeterministicToolSynthesisFallback(
      input.content,
      toolRuns,
      buildTurnBudgetExceededReason(input.webMode, turnBudgetMs),
    );
  }
  if (input.webMode === "deep") {
    return "I ran out of time before I could finish that deep-research pass. Narrow the scope or split it into smaller follow-ups and I can continue.";
  }
  return "I stopped that turn to keep chat responsive. If you want a slower, more exhaustive pass, enable Deep research and resend it.";
}

function buildSearchResultBudgetFallback(
  webMode: ChatWebMode,
  toolRuns: ChatToolRunRecord[],
): string | undefined {
  const recoveredItems = recoverTitleUrlItems(toolRuns, 5);
  if (recoveredItems.length === 0) {
    return undefined;
  }
  const blockedSource = inferBlockedSourceFailure(toolRuns);
  const lines = [
    blockedSource
      ? `A source blocked automated browsing${blockedSource.host ? ` on ${blockedSource.host}` : ""}, so I’m falling back to the strongest leads I recovered so far:`
      : webMode === "deep"
        ? "I ran out of time before I could finish the full deep-research pass, but these look like the strongest leads so far:"
        : "I ran out of time before I could finish a full pass, but these look like the strongest leads so far:",
    "",
    ...recoveredItems.slice(0, 3).map((item, index) => `${index + 1}. ${formatRecoveredSearchLead(item)}`),
    "",
    webMode === "deep"
      ? "If you want, ask me to continue from these results and narrow them down."
      : "If you want, ask me to continue from these results and narrow them down, or retry in Deep mode for a slower pass.",
  ];
  return lines.join("\n");
}

function formatRecoveredSearchLead(item: { title: string | null; url: string }): string {
  const title = item.title?.trim();
  if (title) {
    return title;
  }
  try {
    const parsed = new URL(item.url);
    return parsed.hostname;
  } catch {
    return item.url;
  }
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

interface CompletionStreamToolCallState {
  id?: string;
  type?: string;
  functionName?: string;
  functionArguments: string;
}

interface CompletionStreamAggregate {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  content: string;
  usage?: Record<string, unknown>;
  toolCalls: Map<number, CompletionStreamToolCallState>;
}

function createCompletionStreamAggregate(): CompletionStreamAggregate {
  return {
    content: "",
    toolCalls: new Map<number, CompletionStreamToolCallState>(),
  };
}

function absorbCompletionStreamChunk(
  aggregate: CompletionStreamAggregate,
  rawChunk: Record<string, unknown>,
): { delta?: string; sawToolCall: boolean } {
  if (typeof rawChunk.id === "string") {
    aggregate.id = rawChunk.id;
  }
  if (typeof rawChunk.object === "string") {
    aggregate.object = rawChunk.object;
  }
  if (typeof rawChunk.created === "number") {
    aggregate.created = rawChunk.created;
  }
  if (typeof rawChunk.model === "string") {
    aggregate.model = rawChunk.model;
  }
  if (rawChunk.usage && typeof rawChunk.usage === "object") {
    aggregate.usage = rawChunk.usage as Record<string, unknown>;
  }

  const choices = Array.isArray(rawChunk.choices) ? rawChunk.choices as Array<Record<string, unknown>> : [];
  let textDelta = "";
  let sawToolCall = false;
  for (const choice of choices) {
    const message = choice.message as Record<string, unknown> | undefined;
    if (message && typeof message === "object") {
      const messageDelta = extractMessageContent(message);
      if (messageDelta) {
        aggregate.content += messageDelta;
        textDelta += messageDelta;
      }
      const fullToolCalls = readToolCalls(message, new Map<string, string>());
      if (fullToolCalls.length > 0) {
        sawToolCall = true;
      }
    }

    const delta = choice.delta as Record<string, unknown> | undefined;
    if (!delta || typeof delta !== "object") {
      continue;
    }
    const deltaText = extractContentTextFromDelta(delta.content);
    if (deltaText) {
      aggregate.content += deltaText;
      textDelta += deltaText;
    }
    const deltaToolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls as Array<Record<string, unknown>> : [];
    if (deltaToolCalls.length > 0) {
      sawToolCall = true;
      for (const toolCall of deltaToolCalls) {
        const index = typeof toolCall.index === "number" ? toolCall.index : aggregate.toolCalls.size;
        const current = aggregate.toolCalls.get(index) ?? {
          functionArguments: "",
        };
        if (typeof toolCall.id === "string" && toolCall.id.trim()) {
          current.id = toolCall.id.trim();
        }
        if (typeof toolCall.type === "string" && toolCall.type.trim()) {
          current.type = toolCall.type.trim();
        }
        const fn = toolCall.function as Record<string, unknown> | undefined;
        if (fn && typeof fn === "object") {
          if (typeof fn.name === "string" && fn.name.trim()) {
            current.functionName = fn.name.trim();
          }
          if (typeof fn.arguments === "string") {
            current.functionArguments += fn.arguments;
          }
        }
        aggregate.toolCalls.set(index, current);
      }
    }
  }
  return {
    delta: textDelta || undefined,
    sawToolCall,
  };
}

function extractContentTextFromDelta(content: unknown): string {
  return extractStructuredTextContent(content);
}

function buildCompletionFromAggregate(aggregate: CompletionStreamAggregate): ChatCompletionResponse {
  const toolCalls = [...aggregate.toolCalls.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([, toolCall], index) => ({
      id: toolCall.id ?? `call-${index}`,
      type: toolCall.type ?? "function",
      function: {
        name: toolCall.functionName ?? "tool_fn",
        arguments: toolCall.functionArguments || "{}",
      },
    }));

  return {
    id: aggregate.id,
    object: aggregate.object,
    created: aggregate.created,
    model: aggregate.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: aggregate.content,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: "stop",
      },
    ],
    usage: aggregate.usage,
  };
}
