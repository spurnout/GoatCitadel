import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { mcpRoutes } from "./mcp.js";

describe("mcp routes", () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    if (!app) {
      return;
    }
    await app.close();
    app = null;
  });

  it("passes agentId and approval metadata through /mcp/invoke", async () => {
    const invokeMcpTool = vi.fn(async () => ({
      ok: false,
      approvalRequired: true,
      approvalId: "approval-123",
      policyReason: "approval required by risk gate",
      reasonCodes: ["allowed"],
      error: "MCP invoke requires approval.",
    }));

    app = Fastify();
    app.decorate("gateway", {
      invokeMcpTool,
      listMcpServers: vi.fn(),
      createMcpServer: vi.fn(),
      updateMcpServer: vi.fn(),
      deleteMcpServer: vi.fn(),
      connectMcpServer: vi.fn(),
      disconnectMcpServer: vi.fn(),
      startMcpOAuth: vi.fn(),
      completeMcpOAuth: vi.fn(),
      listMcpTools: vi.fn(),
      updateMcpServerPolicy: vi.fn(),
    } as never);
    await app.register(mcpRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/mcp/invoke",
      payload: {
        serverId: "srv-1",
        toolName: "tool.echo",
        agentId: "operator",
        sessionId: "sess-1",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(invokeMcpTool).toHaveBeenCalledWith({
      serverId: "srv-1",
      toolName: "tool.echo",
      agentId: "operator",
      sessionId: "sess-1",
    });
    expect(response.json()).toMatchObject({
      ok: false,
      approvalRequired: true,
      approvalId: "approval-123",
    });
  });
});
