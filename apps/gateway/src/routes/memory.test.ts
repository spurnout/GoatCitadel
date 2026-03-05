import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { memoryRoutes } from "./memory.js";

describe("memory routes", () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    if (!app) {
      return;
    }
    await app.close();
    app = null;
  });

  it("rejects bulk forget without any criteria", async () => {
    const forgetMemory = vi.fn();
    app = Fastify();
    app.decorate("gateway", {
      forgetMemory,
    } as never);
    await app.register(memoryRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/memory/forget",
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(forgetMemory).not.toHaveBeenCalled();
    expect(response.json()).toMatchObject({
      error: {
        fieldErrors: {
          itemIds: expect.arrayContaining([
            "Provide at least one criterion: itemIds, namespace, or query.",
          ]),
        },
      },
    });
    expect(response.json()).not.toMatchObject({
      error: {
        formErrors: expect.arrayContaining([
          "Provide at least one criterion: itemIds, namespace, or query.",
        ]),
      },
    });
  });

  it("forgets matching memory rows when criteria are provided", async () => {
    const forgetMemory = vi.fn(() => ({
      forgottenCount: 1,
      itemIds: ["mem_1"],
    }));
    app = Fastify();
    app.decorate("gateway", {
      forgetMemory,
    } as never);
    await app.register(memoryRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/memory/forget",
      payload: {
        namespace: "project.alpha",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(forgetMemory).toHaveBeenCalledTimes(1);
    expect(forgetMemory).toHaveBeenCalledWith({
      itemIds: undefined,
      namespace: "project.alpha",
      query: undefined,
      actorId: expect.stringMatching(/^ip:/),
    });
    expect(response.json()).toEqual({
      forgottenCount: 1,
      itemIds: ["mem_1"],
    });
  });
});
