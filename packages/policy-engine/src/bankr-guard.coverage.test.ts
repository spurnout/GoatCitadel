import { describe, expect, it } from "vitest";
import type { Storage } from "@goatcitadel/storage";
import {
  appendBankrActionAudit,
  applyBankrBudgetUsage,
  evaluateBankrActionPreview,
  getDefaultBankrSafetyPolicy,
  normalizeBankrAction,
  normalizeBankrSafetyPolicy,
  readBankrDailyUsage,
  readBankrSafetyPolicy,
  writeBankrSafetyPolicy,
} from "./bankr-guard.js";

function createStorageStub(): {
  storage: Storage;
  daily: Map<string, number>;
  auditRows: Array<Record<string, unknown>>;
} {
  const settings = new Map<string, unknown>();
  const daily = new Map<string, number>();
  const auditRows: Array<Record<string, unknown>> = [];

  const storage = {
    systemSettings: {
      get: <T>(key: string) => {
        if (!settings.has(key)) {
          return undefined;
        }
        return {
          key,
          value: settings.get(key) as T,
        };
      },
      set: (key: string, value: unknown) => {
        settings.set(key, value);
      },
    },
    db: {
      prepare: (sql: string) => ({
        run: (params: Record<string, unknown>) => {
          if (sql.includes("bankr_budget_usage_daily")) {
            const day = String(params.day ?? "");
            const prior = daily.get(day) ?? 0;
            const amount = Number(params.usdTotal ?? 0);
            daily.set(day, prior + (Number.isFinite(amount) ? amount : 0));
            return { changes: 1 };
          }
          if (sql.includes("bankr_action_audit")) {
            auditRows.push({ ...params });
            return { changes: 1 };
          }
          return { changes: 0 };
        },
        get: (params: Record<string, unknown>) => {
          if (sql.includes("FROM bankr_budget_usage_daily")) {
            const day = String(params.day ?? "");
            return { usdTotal: daily.get(day) ?? 0 };
          }
          return undefined;
        },
      }),
    },
  } as unknown as Storage;

  return { storage, daily, auditRows };
}

describe("bankr guard coverage sweep", () => {
  it("normalizes policy input and persists settings", () => {
    const { storage } = createStorageStub();
    const defaults = getDefaultBankrSafetyPolicy();
    expect(defaults.mode).toBe("read_only");

    const updated = writeBankrSafetyPolicy(storage, {
      mode: "read_write",
      dailyUsdCap: "900" as unknown as number,
      perActionUsdCap: "120" as unknown as number,
      allowedChains: ["BASE", "solana", "base"] as unknown as string[],
      allowedActionTypes: ["trade", "read"],
      blockedSymbols: [" eth ", "btc", "BTC"] as unknown as string[],
      requireApprovalEveryWrite: false,
    });

    expect(updated.mode).toBe("read_write");
    expect(updated.dailyUsdCap).toBe(900);
    expect(updated.perActionUsdCap).toBe(120);
    expect(updated.allowedChains).toEqual(["base", "solana"]);
    expect(updated.allowedActionTypes).toEqual(["trade", "read"]);
    expect(updated.blockedSymbols).toEqual(["ETH", "BTC"]);
    expect(updated.requireApprovalEveryWrite).toBe(true);
    expect(readBankrSafetyPolicy(storage).mode).toBe("read_write");
  });

  it("evaluates read/write actions against mode, symbol, and budget caps", () => {
    const { storage } = createStorageStub();

    writeBankrSafetyPolicy(storage, {
      mode: "read_only",
      blockedSymbols: ["RUG"],
    });
    const readOnlyTrade = evaluateBankrActionPreview(storage, {
      actionType: "trade",
      chain: "base",
      symbol: "ETH",
      usdEstimate: 25,
    });
    expect(readOnlyTrade.allowed).toBe(false);
    expect(readOnlyTrade.reasonCode).toBe("read_only_mode");

    const blockedSymbol = evaluateBankrActionPreview(storage, {
      actionType: "read",
      chain: "base",
      symbol: "RUG",
    });
    expect(blockedSymbol.allowed).toBe(false);
    expect(blockedSymbol.reasonCode).toBe("symbol_blocked");

    writeBankrSafetyPolicy(storage, {
      enabled: true,
      mode: "read_write",
      dailyUsdCap: 100,
      perActionUsdCap: 40,
      allowedChains: ["base"],
      allowedActionTypes: ["trade", "read"],
      blockedSymbols: [],
    });

    const tooLarge = evaluateBankrActionPreview(storage, {
      actionType: "trade",
      chain: "base",
      symbol: "ETH",
      usdEstimate: 55,
    });
    expect(tooLarge.allowed).toBe(false);
    expect(tooLarge.reasonCode).toBe("per_action_cap_exceeded");

    const writeAllowed = evaluateBankrActionPreview(storage, {
      actionType: "trade",
      chain: "base",
      symbol: "ETH",
      usdEstimate: 35,
    });
    expect(writeAllowed.allowed).toBe(true);
    expect(writeAllowed.remainingPerActionUsd).toBe(5);

    const afterUsage = applyBankrBudgetUsage(storage, 70, new Date("2026-03-05T10:00:00.000Z"));
    expect(afterUsage).toBe(70);
    expect(readBankrDailyUsage(storage, "2026-03-05")).toBe(70);

    const dailyExceeded = evaluateBankrActionPreview(storage, {
      actionType: "trade",
      chain: "base",
      symbol: "ETH",
      usdEstimate: 40,
    });
    expect(dailyExceeded.allowed).toBe(false);
    expect(dailyExceeded.reasonCode).toBe("daily_cap_exceeded");
  });

  it("normalizes prompt-derived action/chain/symbol/usd and appends audit", () => {
    const { storage, auditRows } = createStorageStub();

    const normalized = normalizeBankrAction({
      prompt: "Please trade $250 ETH on Base right now",
    });
    expect(normalized.actionType).toBe("trade");
    expect(normalized.chain).toBe("base");
    expect(normalized.symbol).toBe("ETH");
    expect(normalized.usdEstimate).toBe(250);

    const fallback = normalizeBankrSafetyPolicy(undefined, undefined);
    expect(fallback.enabled).toBe(true);
    expect(fallback.allowedChains.includes("ethereum")).toBe(true);

    const audit = appendBankrActionAudit(storage, {
      sessionId: "session-1",
      actorId: "operator",
      actionType: "read",
      status: "blocked",
      chain: normalized.chain,
      symbol: normalized.symbol,
      usdEstimate: normalized.usdEstimate,
      details: { note: "coverage" },
    });

    expect(audit.actionId.length).toBeGreaterThan(10);
    expect(auditRows.length).toBe(1);
    expect(auditRows[0]?.detailsJson).toContain("coverage");
  });
});
