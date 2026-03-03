import { useCallback, useEffect, useMemo, useState } from "react";
import type { PromptPackRunRecord, PromptPackScoreRecord, PromptPackTestRecord } from "@goatcitadel/contracts";
import {
  autoScorePromptPackBatch,
  autoScorePromptPackTest,
  exportPromptPackReport,
  fetchLlmConfig,
  fetchLlmModels,
  fetchPromptPackExport,
  fetchPromptPackReport,
  fetchPromptPacks,
  fetchPromptPackTests,
  importPromptPack,
  resetPromptPack,
  runPromptPackTest,
  scorePromptPackTest,
} from "../api/client";
import { ActionButton } from "../components/ActionButton";
import { CardSkeleton } from "../components/CardSkeleton";
import { ChatModelPicker, type ChatModelProviderOption } from "../components/ChatModelPicker";
import { pageCopy } from "../content/copy";

interface ScoreDraft {
  routingScore: 0 | 1 | 2;
  honestyScore: 0 | 1 | 2;
  handoffScore: 0 | 1 | 2;
  robustnessScore: 0 | 1 | 2;
  usabilityScore: 0 | 1 | 2;
  notes: string;
}

const DEFAULT_SCORE_DRAFT: ScoreDraft = {
  routingScore: 1,
  honestyScore: 1,
  handoffScore: 1,
  robustnessScore: 1,
  usabilityScore: 1,
  notes: "",
};

interface ActiveRunState {
  mode: "single" | "next" | "all";
  testId?: string;
  testCode?: string;
}

export function PromptLabPage({ refreshKey = 0 }: { refreshKey?: number }) {
  const [loading, setLoading] = useState(true);
  const [activeRun, setActiveRun] = useState<ActiveRunState | null>(null);
  const [savingScore, setSavingScore] = useState(false);
  const [autoScoring, setAutoScoring] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetClearRuns, setResetClearRuns] = useState(true);
  const [resetClearScores, setResetClearScores] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [packs, setPacks] = useState<Array<{ packId: string; name: string; testCount: number }>>([]);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [tests, setTests] = useState<PromptPackTestRecord[]>([]);
  const [importText, setImportText] = useState("");
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);
  const [report, setReport] = useState<{
    runs: PromptPackRunRecord[];
    scores: PromptPackScoreRecord[];
    summary: {
      totalTests: number;
      completedRuns: number;
      failedRuns: number;
      averageTotalScore: number;
      passRate: number;
      failingCodes: string[];
    };
  } | null>(null);
  const [reuseLastModel, setReuseLastModel] = useState(true);
  const [autoScoreOnRun, setAutoScoreOnRun] = useState(true);
  const [providerOptions, setProviderOptions] = useState<ChatModelProviderOption[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [exportInfo, setExportInfo] = useState<{
    packId: string;
    path: string;
    exists: boolean;
    sizeBytes: number;
    updatedAt?: string;
  } | null>(null);
  const [scoreDraft, setScoreDraft] = useState<ScoreDraft>(DEFAULT_SCORE_DRAFT);
  const running = activeRun !== null;

  const loadLlmCatalog = useCallback(async () => {
    const config = await fetchLlmConfig();
    const options = await Promise.all(config.providers.map(async (provider) => {
      let discoveredModels: string[] = [];
      try {
        const models = await fetchLlmModels(provider.providerId);
        discoveredModels = models.items.map((item) => item.id);
      } catch {
        // Keep the provider visible with known defaults even if remote model discovery fails.
      }
      return {
        providerId: provider.providerId,
        label: provider.label,
        models: dedupeStrings([
          provider.defaultModel,
          provider.providerId === config.activeProviderId ? config.activeModel : undefined,
          ...discoveredModels,
        ]),
      } satisfies ChatModelProviderOption;
    }));

    setProviderOptions(options.filter((item) => item.models.length > 0));
    setSelectedProviderId((current) => {
      if (current && options.some((item) => item.providerId === current)) {
        return current;
      }
      return config.activeProviderId ?? options[0]?.providerId ?? "";
    });
  }, []);

  const loadPack = useCallback(async (packId: string) => {
    const [testsResponse, reportResponse, exportResponse] = await Promise.all([
      fetchPromptPackTests(packId),
      fetchPromptPackReport(packId),
      fetchPromptPackExport(packId).catch(() => ({
        packId,
        path: "",
        exists: false,
        sizeBytes: 0,
      })),
    ]);
    setTests(testsResponse.items);
    setReport({
      runs: reportResponse.runs,
      scores: reportResponse.scores,
      summary: reportResponse.summary,
    });
    setExportInfo(exportResponse);
    setSelectedTestId((current) => current && testsResponse.items.some((item) => item.testId === current)
      ? current
      : testsResponse.items[0]?.testId ?? null);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchPromptPacks();
      setPacks(response.items.map((item) => ({
        packId: item.packId,
        name: item.name,
        testCount: item.testCount,
      })));
      const firstPackId = response.items[0]?.packId ?? null;
      setSelectedPackId((current) => current ?? firstPackId);
      if (firstPackId) {
        await loadPack(firstPackId);
      } else {
        setTests([]);
        setReport(null);
      }
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [loadPack]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    void loadLlmCatalog().catch((err: Error) => setError((current) => current ?? err.message));
  }, [loadLlmCatalog, refreshKey]);

  useEffect(() => {
    if (!selectedPackId) {
      return;
    }
    void loadPack(selectedPackId).catch((err: Error) => setError(err.message));
  }, [loadPack, selectedPackId]);

  const latestRunByTest = useMemo(() => {
    const map = new Map<string, PromptPackRunRecord>();
    for (const run of report?.runs ?? []) {
      if (!map.has(run.testId)) {
        map.set(run.testId, run);
      }
    }
    return map;
  }, [report?.runs]);

  const latestScoreByTest = useMemo(() => {
    const map = new Map<string, PromptPackScoreRecord>();
    for (const score of report?.scores ?? []) {
      if (!map.has(score.testId)) {
        map.set(score.testId, score);
      }
    }
    return map;
  }, [report?.scores]);

  const selectedTest = tests.find((item) => item.testId === selectedTestId) ?? null;
  const selectedRun = selectedTest ? latestRunByTest.get(selectedTest.testId) : undefined;
  const selectedScore = selectedTest ? latestScoreByTest.get(selectedTest.testId) : undefined;

  const lastSuccessfulModel = useMemo(() => {
    for (const run of report?.runs ?? []) {
      if (run.status === "completed" && run.providerId && run.model) {
        return { providerId: run.providerId, model: run.model };
      }
    }
    return undefined;
  }, [report?.runs]);

  const unscoredCompletedCount = useMemo(() => tests.filter((test) => {
    const run = latestRunByTest.get(test.testId);
    const score = latestScoreByTest.get(test.testId);
    return run?.status === "completed" && !score;
  }).length, [latestRunByTest, latestScoreByTest, tests]);

  useEffect(() => {
    if (providerOptions.length === 0) {
      setSelectedModel("");
      return;
    }
    const activeProvider = providerOptions.find((item) => item.providerId === selectedProviderId) ?? providerOptions[0];
    if (!activeProvider) {
      setSelectedModel("");
      return;
    }
    if (!selectedProviderId) {
      setSelectedProviderId(activeProvider.providerId);
    }
    setSelectedModel((current) => current && activeProvider.models.includes(current)
      ? current
      : activeProvider.models[0] ?? "");
  }, [providerOptions, selectedProviderId]);

  const selectedRunModel = useMemo(() => {
    if (reuseLastModel && lastSuccessfulModel) {
      return {
        providerId: lastSuccessfulModel.providerId,
        model: lastSuccessfulModel.model,
      };
    }
    if (!selectedProviderId) {
      return undefined;
    }
    return {
      providerId: selectedProviderId,
      model: selectedModel || undefined,
    };
  }, [lastSuccessfulModel, reuseLastModel, selectedModel, selectedProviderId]);

  useEffect(() => {
    if (selectedScore) {
      setScoreDraft({
        routingScore: selectedScore.routingScore,
        honestyScore: selectedScore.honestyScore,
        handoffScore: selectedScore.handoffScore,
        robustnessScore: selectedScore.robustnessScore,
        usabilityScore: selectedScore.usabilityScore,
        notes: selectedScore.notes ?? "",
      });
      return;
    }
    setScoreDraft(DEFAULT_SCORE_DRAFT);
  }, [selectedScore, selectedTestId]);

  const runOne = useCallback(async (test: PromptPackTestRecord, mode: ActiveRunState["mode"] = "single") => {
    if (!selectedPackId) {
      return;
    }
    setActiveRun({ mode, testId: test.testId, testCode: test.code });
    setError(null);
    setSuccess(null);
    try {
      const input = selectedRunModel;
      const run = await runPromptPackTest(selectedPackId, test.testId, input);
      let autoScoreSummary = "";
      if (autoScoreOnRun && run.status === "completed") {
        const auto = await autoScorePromptPackTest(selectedPackId, test.testId, {
          runId: run.runId,
        });
        autoScoreSummary = ` Auto-scored ${auto.score.totalScore}/10.`;
      }
      await loadPack(selectedPackId);
      setSelectedTestId(test.testId);
      if (run.status === "failed") {
        setError(`Ran ${test.code}, but it failed: ${run.error ?? "Unknown error"}`);
      } else {
        setSuccess(`Ran ${test.code}.${autoScoreSummary}`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActiveRun(null);
    }
  }, [autoScoreOnRun, loadPack, selectedPackId, selectedRunModel]);

  const runAll = useCallback(async () => {
    if (!selectedPackId || tests.length === 0) {
      return;
    }
    setActiveRun({ mode: "all" });
    setError(null);
    setSuccess(null);
    try {
      const input = selectedRunModel;
      let completed = 0;
      let failed = 0;
      let autoScored = 0;
      for (const test of tests) {
        setActiveRun({ mode: "all", testId: test.testId, testCode: test.code });
        const run = await runPromptPackTest(selectedPackId, test.testId, input);
        if (run.status === "failed") {
          failed += 1;
        } else if (run.status === "completed") {
          completed += 1;
          if (autoScoreOnRun) {
            await autoScorePromptPackTest(selectedPackId, test.testId, {
              runId: run.runId,
            });
            autoScored += 1;
          }
        }
      }
      await loadPack(selectedPackId);
      setSuccess(
        `Run all finished: ${completed} completed, ${failed} failed.${autoScoreOnRun ? ` auto-scored ${autoScored}.` : ""}`,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActiveRun(null);
    }
  }, [autoScoreOnRun, loadPack, selectedPackId, selectedRunModel, tests]);

  const runNext = useCallback(async () => {
    if (!selectedPackId || tests.length === 0) {
      return;
    }
    const nextNotRun = tests.find((test) => !latestRunByTest.get(test.testId));
    const nextFailed = tests.find((test) => latestRunByTest.get(test.testId)?.status === "failed");
    const nextUnscoredCompleted = tests.find((test) => {
      const run = latestRunByTest.get(test.testId);
      const score = latestScoreByTest.get(test.testId);
      return run?.status === "completed" && !score;
    });
    const next = nextNotRun ?? nextFailed ?? nextUnscoredCompleted ?? tests[0];
    if (!next) {
      return;
    }
    await runOne(next, "next");
    setSelectedTestId(next.testId);
  }, [latestRunByTest, latestScoreByTest, runOne, selectedPackId, tests]);

  const exportReport = useCallback(async () => {
    if (!selectedPackId) {
      return;
    }
    setExporting(true);
    setError(null);
    try {
      const info = await exportPromptPackReport(selectedPackId);
      setExportInfo(info);
      setSuccess(`Exported report to ${info.path}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExporting(false);
    }
  }, [selectedPackId]);

  const resetPack = useCallback(async () => {
    if (!selectedPackId) {
      return;
    }
    if (!resetClearRuns && !resetClearScores) {
      setError("Select at least one reset option (runs or scores).");
      return;
    }
    const scopeLabel = resetClearRuns && resetClearScores
      ? "run history and scores"
      : resetClearRuns
        ? "run history"
        : "scores";
    const confirmed = window.confirm(
      `Reset this prompt pack? This will clear ${scopeLabel} for this pack.`,
    );
    if (!confirmed) {
      return;
    }
    setResetting(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await resetPromptPack(selectedPackId, {
        clearRuns: resetClearRuns,
        clearScores: resetClearScores,
      });
      await loadPack(selectedPackId);
      setSuccess(
        `Reset complete: removed ${result.deletedRuns} run(s) and ${result.deletedScores} score(s).`,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setResetting(false);
    }
  }, [loadPack, resetClearRuns, resetClearScores, selectedPackId]);

  const copyExportPath = useCallback(async () => {
    if (!exportInfo?.path) {
      return;
    }
    try {
      await navigator.clipboard.writeText(exportInfo.path);
      setSuccess("Copied export path.");
    } catch {
      setError("Failed to copy export path.");
    }
  }, [exportInfo?.path]);

  const submitScore = useCallback(async () => {
    if (!selectedPackId || !selectedTest || !selectedRun) {
      return;
    }
    setSavingScore(true);
    setError(null);
    setSuccess(null);
    try {
      await scorePromptPackTest(selectedPackId, selectedTest.testId, {
        runId: selectedRun.runId,
        routingScore: scoreDraft.routingScore,
        honestyScore: scoreDraft.honestyScore,
        handoffScore: scoreDraft.handoffScore,
        robustnessScore: scoreDraft.robustnessScore,
        usabilityScore: scoreDraft.usabilityScore,
        notes: scoreDraft.notes.trim() || undefined,
      });
      await loadPack(selectedPackId);
      setSuccess(`Saved score for ${selectedTest.code}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingScore(false);
    }
  }, [loadPack, scoreDraft, selectedPackId, selectedRun, selectedTest]);

  const autoScoreSelected = useCallback(async () => {
    if (!selectedPackId || !selectedTest || !selectedRun) {
      return;
    }
    setAutoScoring(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await autoScorePromptPackTest(selectedPackId, selectedTest.testId, {
        runId: selectedRun.runId,
        force: true,
      });
      await loadPack(selectedPackId);
      setSuccess(`Auto-scored ${selectedTest.code}: ${result.score.totalScore}/10.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAutoScoring(false);
    }
  }, [loadPack, selectedPackId, selectedRun, selectedTest]);

  const autoScoreUnscored = useCallback(async () => {
    if (!selectedPackId) {
      return;
    }
    setAutoScoring(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await autoScorePromptPackBatch(selectedPackId, {
        onlyUnscored: true,
      });
      await loadPack(selectedPackId);
      setSuccess(`Auto-scored ${result.items.length} run(s); skipped ${result.skipped}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAutoScoring(false);
    }
  }, [loadPack, selectedPackId]);

  const handleImport = useCallback(async () => {
    const content = importText.trim();
    if (!content) {
      setError("Paste prompt-pack markdown first.");
      return;
    }
    setImporting(true);
    setError(null);
    setSuccess(null);
    try {
      const imported = await importPromptPack({
        content,
        sourceLabel: "manual-import",
      });
      setImportText("");
      await load();
      setSelectedPackId(imported.pack.packId);
      setSuccess(`Imported ${imported.tests.length} tests.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImporting(false);
    }
  }, [importText, load]);

  if (loading) {
    return (
      <section>
        <h2>{pageCopy.promptLab.title}</h2>
        <CardSkeleton lines={10} />
      </section>
    );
  }

  return (
    <section className="prompt-lab">
      <header className="prompt-lab-header">
        <div>
          <h2>{pageCopy.promptLab.title}</h2>
          <p className="office-subtitle">{pageCopy.promptLab.subtitle}</p>
        </div>
        <div className="prompt-lab-actions">
          <ActionButton
            label="Run next test"
            pending={activeRun?.mode === "next"}
            disabled={running && activeRun?.mode !== "next"}
            onClick={() => void runNext()}
          />
          <ActionButton
            label="Run all"
            pending={activeRun?.mode === "all"}
            disabled={running && activeRun?.mode !== "all"}
            onClick={() => void runAll()}
          />
          <ActionButton
            label="Auto score unscored"
            pending={autoScoring}
            disabled={!selectedPackId || unscoredCompletedCount === 0 || running}
            onClick={() => void autoScoreUnscored()}
          />
          <ActionButton
            label="Export now"
            pending={exporting}
            disabled={!selectedPackId || running || resetting}
            onClick={() => void exportReport()}
          />
          <ActionButton
            label="Reset pack"
            pending={resetting}
            disabled={!selectedPackId || running || exporting || importing || autoScoring}
            onClick={() => void resetPack()}
          />
        </div>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {success ? <p className="status-banner">{success}</p> : null}
      {activeRun ? (
        <div className="status-banner">
          Run in progress: {activeRun.testCode ?? "prompt-pack run"} ({activeRun.mode})
        </div>
      ) : null}
      <div className="status-banner">
        <span style={{ marginRight: 12 }}>Reset options:</span>
        <label style={{ marginRight: 12 }}>
          <input
            type="checkbox"
            checked={resetClearRuns}
            onChange={(event) => setResetClearRuns(event.target.checked)}
            disabled={running || resetting || exporting || importing || autoScoring}
          />{" "}
          Clear runs
        </label>
        <label>
          <input
            type="checkbox"
            checked={resetClearScores}
            onChange={(event) => setResetClearScores(event.target.checked)}
            disabled={running || resetting || exporting || importing || autoScoring}
          />{" "}
          Clear scores
        </label>
      </div>
      <div className="status-banner warning">
        {autoScoreOnRun
          ? "Auto-score is ON (model + rule checks). You can still edit any score manually."
          : "Run status only confirms execution. Pass rate updates after scoring."}
        {unscoredCompletedCount > 0 ? ` ${unscoredCompletedCount} run(s) still need scoring.` : ""}
      </div>
      {exportInfo?.path ? (
        <div className="status-banner">
          Export file: <code>{exportInfo.path}</code>
          {exportInfo.updatedAt ? ` (updated ${new Date(exportInfo.updatedAt).toLocaleTimeString()})` : ""}
          {exportInfo.exists ? ` • ${exportInfo.sizeBytes} bytes` : " • not generated yet"}
          <button type="button" onClick={() => void copyExportPath()} style={{ marginLeft: 12 }}>
            Copy path
          </button>
        </div>
      ) : null}

      <div className="prompt-lab-grid">
        <article className="card prompt-lab-import">
          <h3>Import Prompt Pack</h3>
          <textarea
            rows={10}
            placeholder="Paste goatcitadel_prompt_pack.md content here..."
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
          />
          <ActionButton label="Import" pending={importing} onClick={() => void handleImport()} />
          <p className="office-subtitle">Tip: import once, then use Run next test to move quickly through the pack.</p>
        </article>

        <article className="card prompt-lab-packs">
          <h3>Prompt Packs</h3>
          <ul>
            {packs.map((pack) => (
              <li key={pack.packId}>
                <button
                  type="button"
                  className={selectedPackId === pack.packId ? "active" : ""}
                  onClick={() => setSelectedPackId(pack.packId)}
                >
                  {pack.name}
                </button>
                <span>{pack.testCount} tests</span>
              </li>
            ))}
          </ul>
          <div className="prompt-lab-model-picker">
            <p className="office-subtitle">
              {reuseLastModel && lastSuccessfulModel
                ? `Running with last successful model: ${lastSuccessfulModel.providerId}/${lastSuccessfulModel.model}`
                : selectedRunModel?.providerId
                  ? `Running with selected model: ${selectedRunModel.providerId}/${selectedRunModel.model ?? "(provider default)"}`
                  : "Select a provider/model for this prompt-pack run."}
            </p>
            <ChatModelPicker
              providers={providerOptions}
              providerId={selectedProviderId}
              model={selectedModel}
              disabled={running || providerOptions.length === 0}
              onChangeProvider={(providerId) => {
                setReuseLastModel(false);
                setSelectedProviderId(providerId);
                const provider = providerOptions.find((item) => item.providerId === providerId);
                setSelectedModel(provider?.models[0] ?? "");
              }}
              onChangeModel={(model) => {
                setReuseLastModel(false);
                setSelectedModel(model);
              }}
            />
          </div>
          <label className="prompt-lab-toggle">
            <input
              type="checkbox"
              checked={reuseLastModel}
              onChange={(event) => setReuseLastModel(event.target.checked)}
            />
            Reuse last successful model settings
          </label>
          <label className="prompt-lab-toggle">
            <input
              type="checkbox"
              checked={autoScoreOnRun}
              onChange={(event) => setAutoScoreOnRun(event.target.checked)}
            />
            Auto-score completed runs (model + rules)
          </label>
        </article>
      </div>

      <div className="prompt-lab-grid">
        <article className="card prompt-lab-tests">
          <h3>Tests</h3>
          <ul>
            {tests.map((test) => {
              const run = latestRunByTest.get(test.testId);
              const score = latestScoreByTest.get(test.testId);
              return (
                <li key={test.testId}>
                  <button
                    type="button"
                    className={selectedTestId === test.testId ? "active" : ""}
                    onClick={() => setSelectedTestId(test.testId)}
                  >
                    {test.code} - {test.title}
                  </button>
                  <div className="prompt-lab-test-meta">
                    <span className={`prompt-lab-chip ${statusChipClass(run?.status)}`}>{formatRunStatus(run?.status)}</span>
                    <span className={`prompt-lab-chip ${score ? "score-ready" : "score-missing"}`}>{score ? `${score.totalScore}/10` : "Needs score"}</span>
                  </div>
                  <ActionButton
                    label="Run"
                    pending={activeRun?.testId === test.testId}
                    disabled={running && activeRun?.testId !== test.testId}
                    onClick={() => void runOne(test, "single")}
                  />
                </li>
              );
            })}
          </ul>
        </article>

        <article className="card prompt-lab-detail">
          <h3>{selectedTest ? `${selectedTest.code} - ${selectedTest.title}` : "Select a test"}</h3>
          {selectedTest ? <pre>{selectedTest.prompt}</pre> : <p className="office-subtitle">Pick a test to inspect prompt content and score it.</p>}
          {selectedRun ? (
            <section className="prompt-lab-run-summary">
              <p>
                Latest run: <strong>{formatRunStatus(selectedRun.status)}</strong>
                {selectedRun.providerId ? ` • ${selectedRun.providerId}` : ""}
                {selectedRun.model ? ` / ${selectedRun.model}` : ""}
                {selectedRun.finishedAt ? ` • finished ${new Date(selectedRun.finishedAt).toLocaleTimeString()}` : ""}
              </p>
              {selectedRun.status === "failed" && selectedRun.error ? <p className="error">{selectedRun.error}</p> : null}
              {selectedRun.responseText ? (
                <details>
                  <summary>Assistant output</summary>
                  <pre>{selectedRun.responseText}</pre>
                </details>
              ) : null}
              {selectedRun.trace ? (
                <p className="office-subtitle">
                  Tools used: {selectedRun.trace.toolRuns.length}
                  {selectedRun.trace.routing?.fallbackUsed ? ` • fallback: ${selectedRun.trace.routing.fallbackModel ?? "model"}` : ""}
                </p>
              ) : null}
              {selectedRun.citations && selectedRun.citations.length > 0 ? (
                <p className="office-subtitle">Citations captured: {selectedRun.citations.length}</p>
              ) : null}
            </section>
          ) : (
            <p className="office-subtitle">No run yet for this test.</p>
          )}
          <div className="prompt-lab-score-grid">
            <ScoreField label="Routing" value={scoreDraft.routingScore} onChange={(value) => setScoreDraft((current) => ({ ...current, routingScore: value }))} />
            <ScoreField label="Honesty" value={scoreDraft.honestyScore} onChange={(value) => setScoreDraft((current) => ({ ...current, honestyScore: value }))} />
            <ScoreField label="Handoff" value={scoreDraft.handoffScore} onChange={(value) => setScoreDraft((current) => ({ ...current, handoffScore: value }))} />
            <ScoreField label="Robustness" value={scoreDraft.robustnessScore} onChange={(value) => setScoreDraft((current) => ({ ...current, robustnessScore: value }))} />
            <ScoreField label="Usability" value={scoreDraft.usabilityScore} onChange={(value) => setScoreDraft((current) => ({ ...current, usabilityScore: value }))} />
          </div>
          <textarea
            rows={3}
            placeholder="Optional notes..."
            value={scoreDraft.notes}
            onChange={(event) => setScoreDraft((current) => ({ ...current, notes: event.target.value }))}
          />
          <div className="prompt-lab-actions">
            <ActionButton label="Save score" pending={savingScore} onClick={() => void submitScore()} />
            <ActionButton
              label="Auto score this run"
              pending={autoScoring}
              disabled={!selectedRun || selectedRun.status !== "completed"}
              onClick={() => void autoScoreSelected()}
            />
          </div>
          {selectedRun?.status === "failed" ? (
            <div className="status-banner warning">
              Latest run failed. Try running again with web mode `quick`, then review trace and tool grants before scoring.
            </div>
          ) : null}
        </article>
      </div>

      {report ? (
        <article className="card prompt-lab-summary">
          <h3>Report</h3>
          <p>Total tests: {report.summary.totalTests}</p>
          <p>Executed runs: {report.summary.completedRuns}</p>
          <p>Failed runs: {report.summary.failedRuns}</p>
          <p>Scored runs: {report.scores.length}</p>
          <p>Runs waiting for score: {unscoredCompletedCount}</p>
          <p>Average score: {report.summary.averageTotalScore.toFixed(2)}/10</p>
          <p>Pass rate: {(report.summary.passRate * 100).toFixed(1)}%</p>
          <p>Failing tests: {report.summary.failingCodes.length > 0 ? report.summary.failingCodes.join(", ") : "none"}</p>
          <p className="office-subtitle">Reminder: a run can succeed technically and still fail quality scoring.</p>
        </article>
      ) : null}
    </section>
  );
}

function ScoreField(props: {
  label: string;
  value: 0 | 1 | 2;
  onChange: (value: 0 | 1 | 2) => void;
}) {
  return (
    <label className="chat-v11-select">
      {props.label}
      <select value={props.value} onChange={(event) => props.onChange(Number(event.target.value) as 0 | 1 | 2)}>
        <option value={0}>0</option>
        <option value={1}>1</option>
        <option value={2}>2</option>
      </select>
    </label>
  );
}

function formatRunStatus(status?: PromptPackRunRecord["status"]): string {
  if (!status) return "Not run";
  if (status === "completed") return "Ran";
  if (status === "failed") return "Failed";
  return status;
}

function statusChipClass(status?: PromptPackRunRecord["status"]): string {
  if (!status) return "run-not-run";
  if (status === "completed") return "run-completed";
  if (status === "failed") return "run-failed";
  return "run-not-run";
}

function dedupeStrings(values: Array<string | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}
