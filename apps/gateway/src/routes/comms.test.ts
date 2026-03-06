import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { commsRoutes } from "./comms.js";

describe("comms routes", () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    if (!app) {
      return;
    }
    await app.close();
    app = null;
  });

  it("validates gmail send payloads", async () => {
    const commsGmailSend = vi.fn();
    app = Fastify();
    app.decorate("gateway", { commsGmailSend } as never);
    await app.register(commsRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/comms/gmail/send",
      payload: {
        connectionId: "not-a-uuid",
        to: ["bad-email"],
        subject: "",
        bodyText: "",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(commsGmailSend).not.toHaveBeenCalled();
  });

  it("forwards calendar create requests to the gateway", async () => {
    const commsCalendarCreate = vi.fn(async () => ({ eventId: "evt-1" }));
    app = Fastify();
    app.decorate("gateway", { commsCalendarCreate } as never);
    await app.register(commsRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/comms/calendar/create",
      payload: {
        connectionId: "11111111-1111-4111-8111-111111111111",
        title: "Review",
        startIso: "2026-03-05T10:00:00.000Z",
        endIso: "2026-03-05T10:30:00.000Z",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(commsCalendarCreate).toHaveBeenCalledWith(expect.objectContaining({
      title: "Review",
    }));
  });
});
