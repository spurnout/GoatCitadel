import { describe, expect, it, vi } from "vitest";
import { GatewayDevDiagnosticsService, resolveDevDiagnosticsBufferSize } from "./service.js";

describe("gateway dev diagnostics service", () => {
  it("keeps a bounded ring buffer and redacts sensitive keys", () => {
    const service = new GatewayDevDiagnosticsService(true, undefined, false, 2);
    service.record({
      level: "info",
      category: "gateway",
      event: "first",
      message: "first event",
      context: {
        apiKey: "secret-value",
        nested: {
          authorization: "Bearer abc123",
        },
      },
    });
    service.record({
      level: "warn",
      category: "gateway",
      event: "second",
      message: "second event",
    });
    service.record({
      level: "error",
      category: "gateway",
      event: "third",
      message: "third event",
    });

    const items = service.list({ limit: 10 }).items;
    expect(items).toHaveLength(2);
    expect(items[0]?.event).toBe("third");
    expect(items[1]?.event).toBe("second");
    expect(service.list({ limit: 10 }).items.some((item) => item.event === "first")).toBe(false);
  });

  it("logs structured diagnostics to the attached logger when verbose or non-debug", () => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const service = new GatewayDevDiagnosticsService(true, logger as never, false, 10);
    service.record({
      level: "debug",
      category: "gateway",
      event: "debug_event",
      message: "debug event",
    });
    service.record({
      level: "info",
      category: "gateway",
      event: "info_event",
      message: "info event",
    });

    expect(logger.debug).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledTimes(1);
  });

  it("clamps the configured buffer size", () => {
    expect(resolveDevDiagnosticsBufferSize(undefined, 300)).toBe(300);
    expect(resolveDevDiagnosticsBufferSize("5", 300)).toBe(5);
    expect(resolveDevDiagnosticsBufferSize("9000", 300)).toBe(5000);
    expect(resolveDevDiagnosticsBufferSize("-1", 300)).toBe(300);
  });
});
