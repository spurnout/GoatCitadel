import fp from "fastify-plugin";
import path from "node:path";
import fs from "node:fs";
import { loadGatewayConfig } from "../config.js";
import { GatewayService } from "../services/gateway-service.js";

declare module "fastify" {
  interface FastifyInstance {
    gateway: GatewayService;
  }
}

export const gatewayPlugin = fp(async (fastify) => {
  const rootDir = detectRootDir();
  const config = await loadGatewayConfig(rootDir);
  const gateway = new GatewayService(config);
  await gateway.init();

  fastify.decorate("gateway", gateway);

  fastify.addHook("onClose", async () => {
    gateway.close();
  });
});

function detectRootDir(): string {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "../.."),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "config", "assistant.config.json"))) {
      return candidate;
    }
  }

  return path.resolve(process.cwd(), "../..");
}
