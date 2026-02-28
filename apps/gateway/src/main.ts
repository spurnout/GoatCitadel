import { buildApp } from "./app.js";

const port = Number(process.env.GATEWAY_PORT ?? 8787);
const host = process.env.GATEWAY_HOST ?? "127.0.0.1";

const app = await buildApp();
let shuttingDown = false;

const shutdown = async (signal: string) => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  app.log.info({ signal }, "shutting down gateway");
  try {
    await app.close();
    process.exitCode = 0;
  } catch (error) {
    app.log.error(error, "gateway shutdown failed");
    process.exitCode = 1;
  }
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

try {
  await app.listen({ port, host });
  app.log.info(`gateway listening on http://${host}:${port}`);
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
