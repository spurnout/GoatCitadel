import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import type {
  DevDiagnosticsCategory,
  DevDiagnosticsEvent,
  DevDiagnosticsLevel,
  DevDiagnosticsListResponse,
} from "@goatcitadel/contracts";

interface DevDiagnosticsContext {
  correlationId?: string;
  route?: string;
  sessionId?: string;
  chatId?: string;
  turnId?: string;
  providerId?: string;
  modelId?: string;
}

interface DevDiagnosticsFilter {
  level?: DevDiagnosticsLevel;
  category?: string;
  correlationId?: string;
  limit?: number;
}

interface DevDiagnosticsRecordInput {
  level: DevDiagnosticsLevel;
  category: DevDiagnosticsCategory | string;
  event: string;
  message: string;
  context?: Record<string, unknown>;
  correlationId?: string;
  sessionId?: string;
  chatId?: string;
  turnId?: string;
  route?: string;
  providerId?: string;
  modelId?: string;
}

const DEFAULT_BUFFER_SIZE = 300;
const REDACTED = "[redacted]";
const REDACT_KEY_PATTERN = /(token|password|authorization|api[_-]?key|secret|cookie)/i;
const MAX_CONTEXT_DEPTH = 5;

const diagnosticsContextStorage = new AsyncLocalStorage<DevDiagnosticsContext>();

type DevDiagnosticsListener = (event: DevDiagnosticsEvent) => void;

export function runWithDevDiagnosticsContext<T>(context: DevDiagnosticsContext, callback: () => T): T {
  return diagnosticsContextStorage.run(context, callback);
}

export function enterDevDiagnosticsContext(context: DevDiagnosticsContext): void {
  const current = diagnosticsContextStorage.getStore() ?? {};
  diagnosticsContextStorage.enterWith({
    ...current,
    ...context,
  });
}

export function getDevDiagnosticsContext(): DevDiagnosticsContext | undefined {
  return diagnosticsContextStorage.getStore();
}

export function resolveDevDiagnosticsEnabled(): boolean {
  const override = process.env.GOATCITADEL_DEV_DIAGNOSTICS_ENABLED?.trim().toLowerCase();
  if (override === "true" || override === "1" || override === "yes" || override === "on") {
    return true;
  }
  if (override === "false" || override === "0" || override === "no" || override === "off") {
    return false;
  }
  return process.env.NODE_ENV !== "production";
}

export function resolveDevDiagnosticsVerbose(): boolean {
  const override = process.env.GOATCITADEL_DEV_DIAGNOSTICS_VERBOSE?.trim().toLowerCase();
  if (override === "true" || override === "1" || override === "yes" || override === "on") {
    return true;
  }
  if (override === "false" || override === "0" || override === "no" || override === "off") {
    return false;
  }
  return false;
}

export function resolveDevDiagnosticsBufferSize(raw: string | undefined, fallback = DEFAULT_BUFFER_SIZE): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(5000, parsed);
}

export class GatewayDevDiagnosticsService {
  private readonly listeners = new Set<DevDiagnosticsListener>();
  private readonly items: DevDiagnosticsEvent[] = [];

  public constructor(
    private readonly enabled: boolean,
    private logger: FastifyBaseLogger | undefined,
    private readonly verbose: boolean,
    private readonly maxItems = DEFAULT_BUFFER_SIZE,
  ) {}

  public setLogger(logger: FastifyBaseLogger | undefined): void {
    this.logger = logger;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public list(filter: DevDiagnosticsFilter = {}): DevDiagnosticsListResponse {
    if (!this.enabled) {
      return { items: [] };
    }
    const limit = Math.max(1, filter.limit ?? 100);
    const filtered = this.items.filter((item) => {
      if (filter.level && item.level !== filter.level) {
        return false;
      }
      if (filter.category && item.category !== filter.category) {
        return false;
      }
      if (filter.correlationId && item.correlationId !== filter.correlationId) {
        return false;
      }
      return true;
    });
    return {
      items: filtered.slice(-limit).reverse(),
    };
  }

  public subscribe(listener: DevDiagnosticsListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public record(input: DevDiagnosticsRecordInput): DevDiagnosticsEvent | undefined {
    if (!this.enabled) {
      return undefined;
    }

    const inherited = diagnosticsContextStorage.getStore() ?? {};
    const event: DevDiagnosticsEvent = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      level: input.level,
      category: input.category,
      event: input.event,
      message: input.message,
      context: input.context ? (redactValue(input.context, 0) as Record<string, unknown>) : undefined,
      correlationId: input.correlationId ?? inherited.correlationId,
      sessionId: input.sessionId ?? inherited.sessionId,
      chatId: input.chatId ?? inherited.chatId,
      turnId: input.turnId ?? inherited.turnId,
      route: input.route ?? inherited.route,
      providerId: input.providerId ?? inherited.providerId,
      modelId: input.modelId ?? inherited.modelId,
      source: "gateway",
    };

    this.items.push(event);
    if (this.items.length > this.maxItems) {
      this.items.splice(0, this.items.length - this.maxItems);
    }
    for (const listener of this.listeners) {
      listener(event);
    }

    if (this.logger && (this.verbose || event.level !== "debug")) {
      const payload = {
        diagnostics: true,
        category: event.category,
        event: event.event,
        correlationId: event.correlationId,
        sessionId: event.sessionId,
        turnId: event.turnId,
        route: event.route,
        providerId: event.providerId,
        modelId: event.modelId,
        context: event.context,
      };
      switch (event.level) {
        case "error":
          this.logger.error(payload, event.message);
          break;
        case "warn":
          this.logger.warn(payload, event.message);
          break;
        case "info":
          this.logger.info(payload, event.message);
          break;
        default:
          this.logger.debug(payload, event.message);
          break;
      }
    }

    return event;
  }
}

function redactValue(value: unknown, depth: number): unknown {
  if (depth >= MAX_CONTEXT_DEPTH) {
    return "[max-depth]";
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      result[key] = REDACT_KEY_PATTERN.test(key) ? REDACTED : redactValue(nested, depth + 1);
    }
    return result;
  }
  if (typeof value === "string" && /^bearer\s+/i.test(value)) {
    return REDACTED;
  }
  return value;
}
