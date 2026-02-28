import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    idempotencyKey: string;
  }
}