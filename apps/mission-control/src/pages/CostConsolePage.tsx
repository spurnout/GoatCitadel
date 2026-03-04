import { useCallback, useEffect, useState } from "react";
import { fetchCostSummary, fetchMemoryQmdStats, runCheaper, type CostSummaryResponse } from "../api/client";
import { PageGuideCard } from "../components/PageGuideCard";
import { GCSelect } from "../components/ui";
import { pageCopy } from "../content/copy";
import { useRefreshSubscription } from "../hooks/useRefreshSubscription";

type CostScope = "day" | "session" | "agent" | "task";

export function CostConsolePage({ refreshKey: _refreshKey = 0 }: { refreshKey?: number }) {
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFallbackRefreshing, setIsFallbackRefreshing] = useState(false);
  const [scope, setScope] = useState<CostScope>("day");
  const [data, setData] = useState<CostSummaryResponse | null>(null);
  const [recommendation, setRecommendation] = useState<string[] | null>(null);
  const [qmdSavings, setQmdSavings] = useState<{
    totalRuns: number;
    compressionPercent: number;
    expansionPercent: number;
    efficiencyLabel: "reduced" | "expanded" | "neutral";
    originalTokenEstimate: number;
    distilledTokenEstimate: number;
    netTokenDelta: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (options?: { background?: boolean }) => {
    const background = options?.background ?? false;
    if (background) {
      setIsRefreshing(true);
    } else {
      setIsInitialLoading(true);
    }
    try {
      const [summary, stats] = await Promise.all([
        fetchCostSummary(scope),
        fetchMemoryQmdStats(),
      ]);
      setData(summary);
      setQmdSavings({
        totalRuns: stats.totalRuns,
        compressionPercent: stats.compressionPercent,
        expansionPercent: stats.expansionPercent,
        efficiencyLabel: stats.efficiencyLabel,
        originalTokenEstimate: stats.originalTokenEstimate,
        distilledTokenEstimate: stats.distilledTokenEstimate,
        netTokenDelta: stats.netTokenDelta,
      });
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      if (background) {
        setIsRefreshing(false);
      } else {
        setIsInitialLoading(false);
      }
    }
  }, [scope]);

  useEffect(() => {
    void load({ background: false });
  }, [load]);

  useRefreshSubscription(
    "system",
    async () => {
      await load({ background: true });
    },
    {
      enabled: !isInitialLoading,
      coalesceMs: 1200,
      staleMs: 20000,
      pollIntervalMs: 15000,
      onFallbackStateChange: setIsFallbackRefreshing,
    },
  );

  const onRunCheaper = async () => {
    try {
      const res = await runCheaper();
      setRecommendation(res.actions);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (error) {
    return <p className="error">{error}</p>;
  }

  if (isInitialLoading || !data) {
    return <p>Loading cost data...</p>;
  }

  return (
    <section>
      <h2>{pageCopy.costs.title}</h2>
      <p className="office-subtitle">{pageCopy.costs.subtitle}</p>
      <PageGuideCard
        what={pageCopy.costs.guide?.what ?? ""}
        when={pageCopy.costs.guide?.when ?? ""}
        mostCommonAction={pageCopy.costs.guide?.mostCommonAction}
        actions={pageCopy.costs.guide?.actions ?? []}
      />
      {isRefreshing ? <p className="status-banner">Refreshing costs...</p> : null}
      {isFallbackRefreshing ? (
        <p className="status-banner warning">Live updates degraded, checking periodically.</p>
      ) : null}
      <div className="controls-row">
        <label htmlFor="scope">Scope</label>
        <GCSelect
          id="scope"
          value={scope}
          onChange={(value) => setScope(value as CostScope)}
          options={[
            { value: "day", label: "day" },
            { value: "session", label: "session" },
            { value: "agent", label: "agent" },
            { value: "task", label: "task" },
          ]}
        />
        <button type="button" onClick={onRunCheaper}>Run Leaner</button>
      </div>
      {recommendation ? (
        <ul>
          {recommendation.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      ) : null}

      <article className="card">
        <h3>QMD Impact (24h)</h3>
        {qmdSavings ? (
          <>
            <p>
              {qmdSavings.totalRuns} runs. {describeQmdImpact(qmdSavings)}
            </p>
            <p className="office-subtitle">
              Went from {qmdSavings.originalTokenEstimate} tokens to {qmdSavings.distilledTokenEstimate}
              {" "}({formatTokenDelta(qmdSavings.netTokenDelta)}).
            </p>
          </>
        ) : (
          <p>No QMD metrics yet.</p>
        )}
      </article>

      {data.usageAvailability ? (
        <article className="card">
          <h3>Usage Coverage</h3>
          <p>
            Tracked events: {data.usageAvailability.trackedEvents}
            {" | "}
            Usage unavailable: {data.usageAvailability.unknownEvents}
            {" | "}
            Total agent events: {data.usageAvailability.totalAgentEvents}
          </p>
          {data.usageAvailability.unknownEvents > 0 ? (
            <p className="office-subtitle">
              Some assistant responses did not include provider usage, so totals are partial for those events.
            </p>
          ) : (
            <p className="office-subtitle">All recent assistant events reported usage successfully.</p>
          )}
        </article>
      ) : null}

      <table>
        <thead>
          <tr>
            <th>Scope Key</th>
            <th>Token Input</th>
            <th>Token Output</th>
            <th>Total Tokens</th>
            <th>Cost (USD)</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item) => (
            <tr key={item.key}>
              <td>{item.key}</td>
              <td>{item.tokenInput}</td>
              <td>{item.tokenOutput}</td>
              <td>{item.tokenTotal}</td>
              <td>{item.costUsd.toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function describeQmdImpact(stats: {
  efficiencyLabel: "reduced" | "expanded" | "neutral";
  compressionPercent: number;
  expansionPercent: number;
}): string {
  if (stats.efficiencyLabel === "reduced") {
    return `Context reduced by ${stats.compressionPercent.toFixed(1)}%.`;
  }
  if (stats.efficiencyLabel === "expanded") {
    return `Context grew by ${stats.expansionPercent.toFixed(1)}%.`;
  }
  return "Context size stayed stable.";
}

function formatTokenDelta(delta: number): string {
  if (delta > 0) {
    return `+${Math.round(delta)} tokens`;
  }
  if (delta < 0) {
    return `${Math.round(delta)} tokens`;
  }
  return "no token change";
}

