import { useCallback, useEffect, useMemo, useState } from "react";
import {
  approveImprovementAutoTune,
  fetchImprovementReplayRun,
  fetchImprovementReports,
  revertImprovementAutoTune,
  runImprovementReplay,
} from "../api/client";
import { ActionButton } from "../components/ActionButton";
import { PageGuideCard } from "../components/PageGuideCard";
import { pageCopy } from "../content/copy";

export function ImprovementPage({ refreshKey = 0 }: { refreshKey?: number }) {
  const [loading, setLoading] = useState(true);
  const [runningReplay, setRunningReplay] = useState(false);
  const [pendingTuneId, setPendingTuneId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [reports, setReports] = useState<Array<{
    reportId: string;
    runId: string;
    weekStart: string;
    weekEnd: string;
    createdAt: string;
    likelyWrongCount: number;
    sampledDecisions: number;
  }>>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [reportDetail, setReportDetail] = useState<Awaited<ReturnType<typeof fetchImprovementReports>>["items"][number] | null>(null);
  const [runDetail, setRunDetail] = useState<Awaited<ReturnType<typeof fetchImprovementReplayRun>> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchImprovementReports(60);
      const mapped = response.items.map((item) => ({
        reportId: item.reportId,
        runId: item.runId,
        weekStart: item.weekStart,
        weekEnd: item.weekEnd,
        createdAt: item.createdAt,
        likelyWrongCount: item.summary.likelyWrongCount,
        sampledDecisions: item.summary.sampledDecisions,
      }));
      setReports(mapped);
      const nextReportId = selectedReportId && mapped.some((item) => item.reportId === selectedReportId)
        ? selectedReportId
        : mapped[0]?.reportId ?? null;
      setSelectedReportId(nextReportId);
      if (nextReportId) {
        const selected = response.items.find((item) => item.reportId === nextReportId) ?? null;
        setReportDetail(selected);
        if (selected) {
          setRunDetail(await fetchImprovementReplayRun(selected.runId));
        } else {
          setRunDetail(null);
        }
      } else {
        setReportDetail(null);
        setRunDetail(null);
      }
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedReportId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (!selectedReportId || reports.length === 0) {
      return;
    }
    const report = reports.find((item) => item.reportId === selectedReportId);
    if (!report) {
      return;
    }
    void (async () => {
      try {
        const freshReports = await fetchImprovementReports(60);
        const selected = freshReports.items.find((item) => item.reportId === selectedReportId) ?? null;
        setReportDetail(selected);
        if (selected) {
          setRunDetail(await fetchImprovementReplayRun(selected.runId));
        }
      } catch {
        // keep previous state on background refresh errors
      }
    })();
  }, [selectedReportId, reports]);

  const latestSummary = reportDetail?.summary;
  const topItems = useMemo(() => (runDetail?.items ?? []).slice(0, 8), [runDetail?.items]);

  const handleRunNow = useCallback(async () => {
    setRunningReplay(true);
    setError(null);
    setSuccess(null);
    try {
      const replay = await runImprovementReplay({ sampleSize: 500 });
      setSuccess(`Replay run ${replay.run.runId.slice(0, 8)} completed.`);
      await load();
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
      await load();
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
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPendingTuneId(null);
    }
  }, [load]);

  if (loading) {
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

      <div className="prompt-lab-grid">
        <article className="card prompt-lab-tests">
          <h3>Weekly Reports</h3>
          <ul>
            {reports.map((report) => (
              <li key={report.reportId}>
                <button
                  type="button"
                  className={selectedReportId === report.reportId ? "active" : ""}
                  onClick={() => setSelectedReportId(report.reportId)}
                >
                  {new Date(report.weekEnd).toLocaleDateString()} ({report.sampledDecisions} sampled)
                </button>
                <div className="prompt-lab-test-meta">
                  <span className="prompt-lab-chip run-completed">{report.likelyWrongCount} likely wrong</span>
                  <span>{new Date(report.createdAt).toLocaleString()}</span>
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article className="card prompt-lab-detail">
          <h3>Weekly Scorecard</h3>
          {!reportDetail ? <p>No report selected.</p> : (
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
          <ul className="improvement-simple-list">
            {topItems.map((item) => (
              <li key={item.itemId}>
                <strong>{item.causeClass}</strong> - {Math.round(item.wrongnessProbability * 100)}% wrongness
                <div className="table-subtext">{item.summary ?? `${item.decisionType} ${item.turnId ?? item.toolRunId ?? ""}`}</div>
              </li>
            ))}
          </ul>
        ) : <p>No run data available.</p>}
      </article>
    </section>
  );
}
