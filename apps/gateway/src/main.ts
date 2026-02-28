import { buildApp } from "./app.js";

const port = Number(process.env.GATEWAY_PORT ?? 8787);
const host = process.env.GATEWAY_HOST ?? "127.0.0.1";

const app = await buildApp();

try {
  await app.listen({ port, host });
  app.log.info(`gateway listening on http://${host}:${port}`);
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
