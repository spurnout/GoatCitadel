import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";

const statusSchema = z.enum([
  "planning",
  "inbox",
  "assigned",
  "in_progress",
  "testing",
  "review",
  "done",
  "blocked",
]);

const prioritySchema = z.enum(["low", "normal", "high", "urgent"]);

const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).default(50),
  cursor: z.string().optional(),
  status: statusSchema.optional(),
});

const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  assignedAgentId: z.string().min(1).optional(),
  createdBy: z.string().min(1).optional(),
  dueAt: z.string().datetime().optional(),
});

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  assignedAgentId: z.string().min(1).nullable().optional(),
  dueAt: z.string().datetime().optional(),
});

const createActivitySchema = z.object({
  agentId: z.string().min(1).optional(),
  activityType: z.enum(["spawned", "updated", "completed", "file_created", "status_changed", "comment"]),
  message: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

const createDeliverableSchema = z.object({
  deliverableType: z.enum(["file", "url", "artifact"]),
  title: z.string().min(1),
  path: z.string().optional(),
  description: z.string().optional(),
});

const createSubagentSchema = z.object({
  agentSessionId: z.string().min(1),
  agentName: z.string().min(1).optional(),
});

const updateSubagentSchema = z.object({
  status: z.enum(["active", "completed", "failed", "killed"]).optional(),
  endedAt: z.string().datetime().optional(),
});

export const tasksRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/tasks", async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const items = fastify.gateway.listTasks(parsed.data.limit, parsed.data.status, parsed.data.cursor);
    const last = items[items.length - 1];
    const nextCursor = items.length === parsed.data.limit && last
      ? `${last.updatedAt}|${last.taskId}`
      : undefined;
    return reply.send({ items, nextCursor });
  });

  fastify.post("/api/v1/tasks", async (request, reply) => {
    const parsed = createTaskSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const task = fastify.gateway.createTask(parsed.data);
    return reply.code(201).send(task);
  });

  fastify.get("/api/v1/tasks/:taskId", async (request, reply) => {
    const taskId = (request.params as { taskId: string }).taskId;
    try {
      return reply.send(fastify.gateway.getTask(taskId));
    } catch (error) {
      return sendTaskError(reply, error);
    }
  });

  fastify.patch("/api/v1/tasks/:taskId", async (request, reply) => {
    const taskId = (request.params as { taskId: string }).taskId;
    const parsed = updateTaskSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    try {
      const task = fastify.gateway.updateTask(taskId, parsed.data);
      return reply.send(task);
    } catch (error) {
      return sendTaskError(reply, error);
    }
  });

  fastify.delete("/api/v1/tasks/:taskId", async (request, reply) => {
    const taskId = (request.params as { taskId: string }).taskId;
    const deleted = fastify.gateway.deleteTask(taskId);
    if (!deleted) {
      return reply.code(404).send({ error: `Task ${taskId} not found` });
    }
    return reply.send({ deleted: true, taskId });
  });

  fastify.get("/api/v1/tasks/:taskId/activities", async (request, reply) => {
    const taskId = (request.params as { taskId: string }).taskId;
    try {
      return reply.send({ items: fastify.gateway.listTaskActivities(taskId) });
    } catch (error) {
      return sendTaskError(reply, error);
    }
  });

  fastify.post("/api/v1/tasks/:taskId/activities", async (request, reply) => {
    const taskId = (request.params as { taskId: string }).taskId;
    const parsed = createActivitySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    try {
      return reply.code(201).send(fastify.gateway.appendTaskActivity(taskId, parsed.data));
    } catch (error) {
      return sendTaskError(reply, error);
    }
  });

  fastify.get("/api/v1/tasks/:taskId/deliverables", async (request, reply) => {
    const taskId = (request.params as { taskId: string }).taskId;
    try {
      return reply.send({ items: fastify.gateway.listTaskDeliverables(taskId) });
    } catch (error) {
      return sendTaskError(reply, error);
    }
  });

  fastify.post("/api/v1/tasks/:taskId/deliverables", async (request, reply) => {
    const taskId = (request.params as { taskId: string }).taskId;
    const parsed = createDeliverableSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    try {
      return reply.code(201).send(fastify.gateway.appendTaskDeliverable(taskId, parsed.data));
    } catch (error) {
      return sendTaskError(reply, error);
    }
  });

  fastify.get("/api/v1/tasks/:taskId/subagents", async (request, reply) => {
    const taskId = (request.params as { taskId: string }).taskId;
    try {
      return reply.send({ items: fastify.gateway.listTaskSubagents(taskId) });
    } catch (error) {
      return sendTaskError(reply, error);
    }
  });

  fastify.post("/api/v1/tasks/:taskId/subagents", async (request, reply) => {
    const taskId = (request.params as { taskId: string }).taskId;
    const parsed = createSubagentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    try {
      return reply.code(201).send(fastify.gateway.registerTaskSubagent(taskId, parsed.data));
    } catch (error) {
      return sendTaskError(reply, error);
    }
  });

  fastify.patch("/api/v1/subagents/:agentSessionId", async (request, reply) => {
    const agentSessionId = (request.params as { agentSessionId: string }).agentSessionId;
    const parsed = updateSubagentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    try {
      return reply.send(fastify.gateway.updateTaskSubagent(agentSessionId, parsed.data));
    } catch (error) {
      return sendTaskError(reply, error);
    }
  });
};

function sendTaskError(reply: FastifyReply, error: unknown) {
  const message = (error as Error).message;
  if (message.includes("not found")) {
    return reply.code(404).send({ error: message });
  }
  if (message.includes("Cannot mark task done")) {
    return reply.code(409).send({ error: message });
  }
  requestLogTaskError(error);
  return reply.code(400).send({ error: "Invalid task request" });
}

function requestLogTaskError(error: unknown): void {
  // Keep full stack in server logs but avoid leaking internals to API clients.
  console.error("[tasks] route error", error);
}
