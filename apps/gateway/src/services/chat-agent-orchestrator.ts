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
    const approval = events.find((event) => event.type === "approval_required")?.approval;
    if (!doneTrace) {
      throw new Error("Agent turn ended without trace.");
    }
    return {
      turnTrace: doneTrace,
      assistantContent: doneMessage?.content ?? "",
      assistantModel: doneTrace.model,
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
      : this.buildToolSchema();
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

    // Deterministic live-time helper for simple queries.
    if (detectTimeIntent(input.content)) {
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
      !approvalPayload
      && input.toolAutonomy !== "manual"
      && input.webMode !== "off"
      && detectLiveDataIntent(input.content)
      && !detectTimeIntent(input.content)
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
          tool_calls: toolCalls as unknown as Array<Record<string, unknown>>,
        } as unknown as ChatCompletionMessage);

        for (const toolCall of toolCalls) {
          if (toolRunCount >= MAX_TOOL_RUNS_PER_TURN) {
            throw new Error("Tool run limit reached for this turn.");
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

  private buildToolSchema(): {
    tools: Array<Record<string, unknown>>;
    modelToCanonical: Map<string, string>;
    canonicalToModel: Map<string, string>;
  } {
    const catalog = this.deps.listToolCatalog();
    const modelToCanonical = new Map<string, string>();
    const canonicalToModel = new Map<string, string>();
    const tools = catalog.map((tool) => {
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
    const startedAt = new Date().toISOString();
    const toolRunId = randomUUID();
    const created = this.deps.storage.chatToolRuns.create({
      toolRunId,
      turnId: input.turnId,
      sessionId: input.input.sessionId,
      toolName: input.toolName,
      status: "started",
      args: input.rawArgs,
      startedAt,
    });

    try {
      const result = await this.deps.invokeTool({
        toolName: input.toolName,
        args: input.rawArgs,
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
}> {
  const raw = message.tool_calls;
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: Array<{ id: string; toolName: string; args: Record<string, unknown> }> = [];
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
    if (typeof rawArgs === "string" && rawArgs.trim()) {
      try {
        const parsed = JSON.parse(rawArgs) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          args = parsed as Record<string, unknown>;
        }
      } catch {
        args = {};
      }
    }
    out.push({ id, toolName, args });
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
