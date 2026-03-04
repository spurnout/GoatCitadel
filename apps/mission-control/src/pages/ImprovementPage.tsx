import { useCallback, useEffect, useMemo, useState } from "react";
import {
  approveImprovementAutoTune,
  fetchImprovementReplayRun,
  fetchImprovementReplayRuns,
  fetchImprovementReports,
  revertImprovementAutoTune,
  runImprovementReplay,
} from "../api/client";
import { ActionButton } from "../components/ActionButton";
import { PageGuideCard } from "../components/PageGuideCard";
import { pageCopy } from "../content/copy";
import { useRefreshSubscription } from "../hooks/useRefreshSubscription";

export function ImprovementPage({ refreshKey: _refreshKey = 0 }: { refreshKey?: number; workspaceId?: string }) {
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFallbackRefreshing, setIsFallbackRefreshing] = useState(false);
  const [runningReplay, setRunningReplay] = useState(false);
  const [pendingTuneId, setPendingTuneId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastRunEvent, setLastRunEvent] = useState<string | null>(null);
  const [lastRunUpdateAt, setLastRunUpdateAt] = useState<string | null>(null);
  const [reports, setReports] = useState<Awaited<ReturnType<typeof fetchImprovementReports>>["items"]>([]);
  const [replayRuns, setReplayRuns] = useState<Awaited<ReturnType<typeof fetchImprovementReplayRuns>>["items"]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<Awaited<ReturnType<typeof fetchImprovementReplayRun>> | null>(null);

  const load = useCallback(async (options?: { background?: boolean }) => {
    const background = options?.background ?? false;
    if (background) {
      setIsRefreshing(true);
    } else {
      setIsInitialLoading(true);
    }
    try {
      const [reportResponse, runResponse] = await Promise.all([
        fetchImprovementReports(60),
        fetchImprovementReplayRuns(80),
      ]);
      setReports(reportResponse.items);
      setReplayRuns(runResponse.items);
      const nextReportId = selectedReportId && reportResponse.items.some((item) => item.reportId === selectedReportId)
        ? selectedReportId
        : reportResponse.items[0]?.reportId ?? null;
      setSelectedReportId(nextReportId);
      const preferredRunId = nextReportId
        ? reportResponse.items.find((item) => item.reportId === nextReportId)?.runId
        : undefined;
      const nextRunId = selectedRunId && runResponse.items.some((item) => item.runId === selectedRunId)
        ? selectedRunId
        : (preferredRunId ?? runResponse.items[0]?.runId ?? null);
      setSelectedRunId(nextRunId);
      if (nextRunId) {
        setRunDetail(await fetchImprovementReplayRun(nextRunId));
      } else {
        setRunDetail(null);
      }
      setLastRunUpdateAt(new Date().toISOString());
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
  }, [selectedReportId, selectedRunId]);

  useEffect(() => {
    void load({ background: false });
  }, [load]);

  useRefreshSubscription(
    "improvement",
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

  useEffect(() => {
    if (!selectedRunId) {
      setRunDetail(null);
      return;
    }
    let cancelled = false;
    void fetchImprovementReplayRun(selectedRunId)
      .then((detail) => {
        if (!cancelled) {
          setRunDetail(detail);
          if (detail.run.reportId) {
            setSelectedReportId((current) => current ?? detail.run.reportId ?? null);
          }
        }
      })
      .catch(() => {
        // keep previous detail when background fetch fails
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRunId]);

  const reportDetail = useMemo(
    () => reports.find((item) => item.reportId === selectedReportId) ?? null,
    [reports, selectedReportId],
  );
  const activeRunStatus = useMemo(() => {
    if (!selectedRunId) {
      return null;
    }
    if (runDetail?.run.runId === selectedRunId) {
      return runDetail.run.status;
    }
    return replayRuns.find((run) => run.runId === selectedRunId)?.status ?? null;
  }, [replayRuns, runDetail, selectedRunId]);

  const latestSummary = reportDetail?.summary;
  const topItems = useMemo(() => (runDetail?.items ?? []).slice(0, 8), [runDetail?.items]);

  useEffect(() => {
    if (!selectedRunId || (activeRunStatus !== "running" && activeRunStatus !== "queued")) {
      return;
    }
    let cancelled = false;
    const pollRun = async () => {
      try {
        const detail = await fetchImprovementReplayRun(selectedRunId);
        if (cancelled) {
          return;
        }
        setRunDetail(detail);
        setReplayRuns((current) => upsertReplayRun(current, detail.run));
        if (detail.run.reportId) {
          setSelectedReportId((prev) => prev ?? detail.run.reportId ?? null);
        }
        setLastRunEvent(`Run ${detail.run.runId.slice(0, 8)} is ${detail.run.status}.`);
        setLastRunUpdateAt(new Date().toISOString());
        if (detail.run.status !== "running" && detail.run.status !== "queued") {
          void load({ background: true });
        }
      } catch {
        // polling errors are transient; keep last known state
      }
    };
    void pollRun();
    const timer = window.setInterval(() => {
      void pollRun();
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeRunStatus, load, selectedRunId]);

  const handleRunNow = useCallback(async () => {
    setRunningReplay(true);
    setError(null);
    setSuccess(null);
    try {
      const replay = await runImprovementReplay({ sampleSize: 500 });
      setReplayRuns((current) => upsertReplayRun(current, replay.run));
      setRunDetail((current) => {
        if (current?.run.runId === replay.run.runId) {
          return {
            ...current,
            run: replay.run,
          };
        }
        return {
          run: replay.run,
          items: [],
          findings: [],
          autoTunes: [],
        };
      });
      if (replay.run.status === "running") {
        setSuccess(`Replay run ${replay.run.runId.slice(0, 8)} started. Results will appear when it finishes.`);
      } else {
        setSuccess(`Replay run ${replay.run.runId.slice(0, 8)} completed.`);
      }
      setLastRunEvent(`Run ${replay.run.runId.slice(0, 8)} started (${replay.run.status}).`);
      setLastRunUpdateAt(new Date().toISOString());
      setSelectedRunId(replay.run.runId);
      await load({ background: true });
      if (replay.report) {
        setSelectedReportId(replay.report.reportId);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunningReplay(false);
    }
  }, [load]);

  const handleApproveTune = useCallback(async (tuneId: string) => {
    setPendingTuneId(tuneId);
    setError(null);
    setSuccess(null);
    try {
      await approveImprovementAutoTune(tuneId);
      setSuccess("Auto-tune approved and applied.");
      await load({ background: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPendingTuneId(null);
    }
  }, [load]);

  const handleRevertTune = useCallback(async (tuneId: string) => {
    setPendingTuneId(tuneId);
    setError(null);
    setSuccess(null);
    try {
      await revertImprovementAutoTune(tuneId);
      setSuccess("Auto-tune reverted.");
      await load({ background: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPendingTuneId(null);
    }
  }, [load]);

  if (isInitialLoading) {
    return <p>Loading improvement reports...</p>;
  }

  return (
    <section className="improvement-page">
      <div className="prompt-lab-header">
        <div>
          <h2>{pageCopy.improvement.title}</h2>
          <p className="office-subtitle">{pageCopy.improvement.subtitle}</p>
        </div>
        <div className="prompt-lab-actions">
          <ActionButton
            label="Run Replay Now"
            pendingLabel="Running Replay..."
            onClick={handleRunNow}
            pending={runningReplay}
          />
        </div>
      </div>

      <PageGuideCard
        what={pageCopy.improvement.guide?.what ?? ""}
        when={pageCopy.improvement.guide?.when ?? ""}
        actions={pageCopy.improvement.guide?.actions ?? []}
      />

      {error ? <p className="error">{error}</p> : null}
      {success ? <p>{success}</p> : null}
      {isRefreshing ? <p className="status-banner">Refreshing improvement reports...</p> : null}
      {isFallbackRefreshing ? (
        <p className="status-banner warning">Live updates degraded, checking periodically.</p>
      ) : null}
      {lastRunEvent ? (
        <p className="office-subtitle">
          {lastRunEvent}
          {lastRunUpdateAt ? ` Last update: ${new Date(lastRunUpdateAt).toLocaleTimeString()}.` : ""}
        </p>
      ) : null}

      <article className="card">
        <h3>Recent Replay Runs</h3>
        <ul className="improvement-simple-list">
          {replayRuns.map((run) => (
            <li key={run.runId}>
              <button
                type="button"
                className={selectedRunId === run.runId ? "active" : ""}
                onClick={() => setSelectedRunId(run.runId)}
              >
                {new Date(run.startedAt).toLocaleString()}
              </button>
              <div className="prompt-lab-test-meta">
                <span className={`prompt-lab-chip run-${run.status}`}>
                  {run.status}
                </span>
                <span>{run.totalScored}/{run.totalCandidates} scored</span>
                <span>{run.likelyWrongCount} likely wrong</span>
              </div>
              {run.error ? <div className="table-subtext">{run.error}</div> : null}
            </li>
          ))}
        </ul>
        {replayRuns.length === 0 ? <p>No replay runs yet.</p> : null}
      </article>

      <div className="prompt-lab-grid">
        <article className="card prompt-lab-tests">
          <h3>Weekly Reports</h3>
          <ul>
            {reports.map((report) => (
              <li key={report.reportId}>
                <button
                  type="button"
                  className={selectedReportId === report.reportId ? "active" : ""}
                  onClick={() => {
                    setSelectedReportId(report.reportId);
                    setSelectedRunId(report.runId);
                  }}
                >
                  {new Date(report.weekEnd).toLocaleDateString()} ({report.summary.sampledDecisions} sampled)
                </button>
                <div className="prompt-lab-test-meta">
                  <span className="prompt-lab-chip run-completed">{report.summary.likelyWrongCount} likely wrong</span>
                  <span>{new Date(report.createdAt).toLocaleString()}</span>
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article className="card prompt-lab-detail">
          <h3>Weekly Scorecard</h3>
          {!reportDetail ? (
            <p>
              {runDetail?.run.status === "running"
                ? "Replay is still running. A weekly report appears after scoring and clustering complete."
                : "No report selected yet."}
            </p>
          ) : (
            <>
              <div className="improvement-score-grid">
                <div><strong>Sampled</strong><p>{latestSummary?.sampledDecisions ?? 0}</p></div>
                <div><strong>Likely wrong</strong><p>{latestSummary?.likelyWrongCount ?? 0}</p></div>
                <div><strong>Wrongness rate</strong><p>{((latestSummary?.wrongnessRate ?? 0) * 100).toFixed(1)}%</p></div>
                <div><strong>Duplicates filtered</strong><p>{latestSummary?.duplicateSuppressedCount ?? 0}</p></div>
                <div><strong>Improved</strong><p>{latestSummary?.improvedCount ?? 0}</p></div>
                <div><strong>Regressed</strong><p>{latestSummary?.regressedCount ?? 0}</p></div>
              </div>

              <h4>Top clusters</h4>
              <ul className="improvement-simple-list">
                {(latestSummary?.topCauseClasses ?? []).map((entry) => (
                  <li key={`${entry.causeClass}:${entry.count}`}>
                    <strong>{entry.causeClass}</strong> - {entry.count}
                  </li>
                ))}
              </ul>

              <h4>Week-over-week</h4>
              <details open>
                <summary>What changed</summary>
                <div className="improvement-compare-grid">
                  <div>
                    <strong>Improved</strong>
                    <ul className="improvement-simple-list">
                      {(reportDetail.weekOverWeek.improved.length > 0 ? reportDetail.weekOverWeek.improved : ["none"]).map((line) => (
                        <li key={`imp-${line}`}>{line}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <strong>Regressed</strong>
                    <ul className="improvement-simple-list">
                      {(reportDetail.weekOverWeek.regressed.length > 0 ? reportDetail.weekOverWeek.regressed : ["none"]).map((line) => (
                        <li key={`reg-${line}`}>{line}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </details>
            </>
          )}
        </article>
      </div>

      <div className="split-grid">
        <article className="card">
          <h3>Applied Low-Risk Auto-Tunes</h3>
          <div className="stack-md">
            {(reportDetail?.appliedAutoTunes ?? []).map((tune) => (
              <div key={tune.tuneId} className="prompt-lab-run-summary">
                <p><strong>{tune.tuneClass}</strong> - {tune.description}</p>
                <p>Status: {tune.status} | Risk: {tune.riskLevel}</p>
                <div className="actions">
                  <ActionButton
                    label="Revert"
                    pendingLabel="Reverting..."
                    onClick={() => handleRevertTune(tune.tuneId)}
                    pending={pendingTuneId === tune.tuneId}
                  />
                </div>
              </div>
            ))}
            {(reportDetail?.appliedAutoTunes.length ?? 0) === 0 ? <p>No applied tunes in this report.</p> : null}
          </div>
        </article>

        <article className="card">
          <h3>Queued Recommendations</h3>
          <div className="stack-md">
            {(reportDetail?.queuedRecommendations ?? []).map((tune) => (
              <div key={tune.tuneId} className="prompt-lab-run-summary">
                <p><strong>{tune.tuneClass}</strong> - {tune.description}</p>
                <p>Status: {tune.status} | Risk: {tune.riskLevel}</p>
                <div className="actions">
                  <ActionButton
                    label="Approve"
                    pendingLabel="Applying..."
                    onClick={() => handleApproveTune(tune.tuneId)}
                    pending={pendingTuneId === tune.tuneId}
                    disabled={tune.riskLevel !== "low"}
                  />
                </div>
              </div>
            ))}
            {(reportDetail?.queuedRecommendations.length ?? 0) === 0 ? <p>No queued recommendations in this report.</p> : null}
          </div>
        </article>
      </div>

      <article className="card">
        <h3>Top Wrong Decisions (Current Run)</h3>
        {runDetail ? (
          <>
            <p className="office-subtitle">
              Status: {runDetail.run.status} | Scored {runDetail.run.totalScored}/{runDetail.run.totalCandidates}
              {runDetail.run.finishedAt ? ` | Finished ${new Date(runDetail.run.finishedAt).toLocaleString()}` : ""}
            </p>
            {runDetail.run.error ? <p className="error">{runDetail.run.error}</p> : null}
            <ul className="improvement-simple-list">
              {topItems.map((item) => (
                <li key={item.itemId}>
                  <strong>{item.causeClass}</strong> - {Math.round(item.wrongnessProbability * 100)}% wrongness
                  <div className="table-subtext">{item.summary ?? `${item.decisionType} ${item.turnId ?? item.toolRunId ?? ""}`}</div>
                </li>
              ))}
            </ul>
          </>
        ) : <p>No run data available.</p>}
      </article>
    </section>
  );
}

function upsertReplayRun<T extends { runId: string; startedAt: string }>(
  current: T[],
  next: T,
): T[] {
  const index = current.findIndex((item) => item.runId === next.runId);
  if (index === -1) {
    return [next, ...current].sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt));
  }
  const copy = [...current];
  copy[index] = next;
  return copy.sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt));
}
