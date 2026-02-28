import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const uploadSchema = z.object({
  relativePath: z.string().min(1),
  content: z.string(),
});

const downloadQuerySchema = z.object({
  relativePath: z.string().min(1),
  raw: z.coerce.boolean().default(false),
});

const previewQuerySchema = z.object({
  relativePath: z.string().min(1),
});

const listQuerySchema = z.object({
  dir: z.string().default("."),
  limit: z.coerce.number().int().positive().max(5000).default(1000),
});

export const filesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/v1/files/list", async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    try {
      const items = await fastify.gateway.listWorkspaceFiles(parsed.data.dir, parsed.data.limit);
      return reply.send({ items });
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.post("/api/v1/files/upload", async (request, reply) => {
    const parsed = uploadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    try {
      const uploaded = await fastify.gateway.uploadWorkspaceFile(
        parsed.data.relativePath,
        parsed.data.content,
      );
      return reply.code(201).send(uploaded);
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });

  fastify.get("/api/v1/files/download", async (request, reply) => {
    const parsed = downloadQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    try {
      const file = await fastify.gateway.downloadWorkspaceFile(parsed.data.relativePath);

      if (parsed.data.raw) {
        reply.header("Content-Type", file.contentType);
        reply.header("Content-Length", String(file.size));
        return reply.send(file.content);
      }

      return reply.send({
        relativePath: file.relativePath,
        fullPath: file.fullPath,
        size: file.size,
        modifiedAt: file.modifiedAt,
        contentType: file.contentType,
        encoding: file.isText ? "utf8" : "base64",
        content: file.isText ? file.content : Buffer.from(file.content).toString("base64"),
      });
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes("not found")) {
        return reply.code(404).send({ error: message });
      }
      return reply.code(400).send({ error: message });
    }
  });

  fastify.get("/api/v1/files/preview", async (request, reply) => {
    const parsed = previewQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    if (!parsed.data.relativePath.endsWith(".html") && !parsed.data.relativePath.endsWith(".htm")) {
      return reply.code(400).send({ error: "Only HTML files can be previewed" });
    }

    try {
      const file = await fastify.gateway.downloadWorkspaceFile(parsed.data.relativePath);
      if (!file.isText) {
        return reply.code(400).send({ error: "Preview supports text HTML files only" });
      }
      reply.header("Content-Type", "text/html; charset=utf-8");
      return reply.send(file.content);
    } catch (error) {
      return reply.code(400).send({ error: (error as Error).message });
    }
  });
};
