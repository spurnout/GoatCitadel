import { timingSafeEqual } from "node:crypto";
import fp from "fastify-plugin";

export const authPlugin = fp(async (fastify) => {
  fastify.addHook("onRequest", async (request, reply) => {
    if (request.method === "OPTIONS") {
      return;
    }
    if (request.url.startsWith("/health")) {
      return;
    }

    const auth = fastify.gatewayConfig.assistant.auth;
    if (auth.mode === "none") {
      return;
    }

    const remoteAddress = request.raw.socket.remoteAddress ?? request.ip;
    const forwardedFor = request.headers["x-forwarded-for"];
    if (
      auth.allowLoopbackBypass
      && !forwardedFor
      && isLoopbackAddress(remoteAddress)
    ) {
      return;
    }

    if (auth.mode === "token") {
      const configuredToken = auth.token.value?.trim();
      if (!configuredToken) {
        return reply.code(503).send({
          error: "Gateway auth mode is token, but no token is configured",
        });
      }

      const provided = readBearerToken(request.headers.authorization)
        ?? readHeaderToken(request.headers["x-goatcitadel-token"])
        ?? readQueryToken(request.query, auth.token.queryParam);

      if (!provided || !timingSafeStringEqual(provided, configuredToken)) {
        return reply.code(401).send({
          error: "Unauthorized",
          authMode: "token",
        });
      }
      return;
    }

    if (auth.mode === "basic") {
      const username = auth.basic.username?.trim();
      const password = auth.basic.password?.trim();
      if (!username || !password) {
        return reply.code(503).send({
          error: "Gateway auth mode is basic, but credentials are not configured",
        });
      }

      const credentials = readBasicCredentials(request.headers.authorization)
        ?? readBasicCredentialsFromQuery(request.query);
      if (
        !credentials
        || !timingSafeStringEqual(credentials.username, username)
        || !timingSafeStringEqual(credentials.password, password)
      ) {
        reply.header("WWW-Authenticate", 'Basic realm="GoatCitadel Gateway"');
        return reply.code(401).send({
          error: "Unauthorized",
          authMode: "basic",
        });
      }
      return;
    }
  });
});

function readHeaderToken(value: string | string[] | undefined): string | undefined {
  if (!value || Array.isArray(value)) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readQueryToken(query: unknown, queryParam: string): string | undefined {
  if (!query || typeof query !== "object") {
    return undefined;
  }
  const value = (query as Record<string, unknown>)[queryParam];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readBearerToken(header: string | string[] | undefined): string | undefined {
  if (!header || Array.isArray(header)) {
    return undefined;
  }
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return undefined;
  }
  const token = match[1]?.trim();
  return token && token.length > 0 ? token : undefined;
}

function readBasicCredentials(header: string | string[] | undefined): { username: string; password: string } | undefined {
  if (!header || Array.isArray(header)) {
    return undefined;
  }
  const match = header.match(/^Basic\s+(.+)$/i);
  if (!match) {
    return undefined;
  }
  try {
    const decoded = Buffer.from(match[1] ?? "", "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator <= 0) {
      return undefined;
    }
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return undefined;
  }
}

function readBasicCredentialsFromQuery(query: unknown): { username: string; password: string } | undefined {
  if (!query || typeof query !== "object") {
    return undefined;
  }
  const raw = (query as Record<string, unknown>).basic_auth;
  if (typeof raw !== "string" || !raw.trim()) {
    return undefined;
  }
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator <= 0) {
      return undefined;
    }
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return undefined;
  }
}

function isLoopbackAddress(ip: string): boolean {
  const normalized = ip.replace("::ffff:", "");
  return normalized === "127.0.0.1" || normalized === "::1";
}

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}
