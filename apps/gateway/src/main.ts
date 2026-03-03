import { buildApp } from "./app.js";

const port = Number(process.env.GATEWAY_PORT ?? 8787);
const host = process.env.GATEWAY_HOST ?? "0.0.0.0";
const warnUnauthNonLoopback = resolveWarnUnauthNonLoopback();

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
  if (warnUnauthNonLoopback && shouldWarnUnauthNonLoopbackBind(host, app.gatewayConfig.assistant.auth)) {
    app.log.warn(
      {
        host,
        authMode: app.gatewayConfig.assistant.auth.mode,
      },
      "Binding gateway to non-loopback host without configured auth. Set GOATCITADEL_AUTH_TOKEN or GOATCITADEL_AUTH_MODE=basic for safer remote access.",
    );
  }
  await app.listen({ port, host });
  app.log.info(`gateway listening on http://${host}:${port}`);
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}

function resolveWarnUnauthNonLoopback(): boolean {
  const raw = process.env.GOATCITADEL_WARN_UNAUTH_NON_LOOPBACK?.trim().toLowerCase();
  if (!raw) {
    return true;
  }
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function shouldWarnUnauthNonLoopbackBind(
  bindHost: string,
  auth: {
    mode: "none" | "token" | "basic";
    token: { value?: string };
    basic: { username?: string; password?: string };
  },
): boolean {
  if (isLoopbackHost(bindHost)) {
    return false;
  }
  if (auth.mode === "none") {
    return true;
  }
  if (auth.mode === "token") {
    return !auth.token.value?.trim();
  }
  return !(auth.basic.username?.trim() && auth.basic.password?.trim());
}

function isLoopbackHost(value: string): boolean {
  const hostValue = value.trim().toLowerCase();
  if (!hostValue) {
    return false;
  }
  return hostValue === "127.0.0.1"
    || hostValue === "localhost"
    || hostValue === "::1"
    || hostValue === "[::1]";
}
