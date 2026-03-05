import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { skillsRoutes } from "./skills.js";

describe("skills routes bankr migration", () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    if (!app) {
      return;
    }
    await app.close();
    app = null;
  });

  it("returns 410 migration guidance when Bankr built-in is disabled", async () => {
    app = Fastify();
    app.decorate("gateway", {
      isFeatureEnabled: vi.fn((flag: string) => flag !== "bankrBuiltinEnabled"),
      getBankrOptionalMigrationMessage: vi.fn(
        () => "Bankr built-in is disabled. Install optional skill.",
      ),
    } as never);
    await app.register(skillsRoutes);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/skills/bankr/policy",
    });

    expect(response.statusCode).toBe(410);
    expect(response.json()).toMatchObject({
      code: "bankr_builtin_disabled",
      docsPath: "docs/OPTIONAL_BANKR_SKILL.md",
      templatePath: "templates/skills/bankr-optional/SKILL.md",
    });
  });

  it("delegates to gateway Bankr handlers when built-in feature is enabled", async () => {
    const getPolicy = vi.fn(() => ({
      enabled: true,
      mode: "read_only",
      dailyUsdCap: 100,
      perActionUsdCap: 25,
      requireApprovalEveryWrite: true,
      allowedChains: ["base"],
      allowedActionTypes: ["read"],
      blockedSymbols: [],
    }));

    app = Fastify();
    app.decorate("gateway", {
      isFeatureEnabled: vi.fn(() => true),
      getBankrOptionalMigrationMessage: vi.fn(() => ""),
      getBankrSafetyPolicy: getPolicy,
    } as never);
    await app.register(skillsRoutes);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/skills/bankr/policy",
    });

    expect(response.statusCode).toBe(200);
    expect(getPolicy).toHaveBeenCalledTimes(1);
    expect(response.json()).toMatchObject({
      enabled: true,
      mode: "read_only",
    });
  });
});
