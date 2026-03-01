import { useEffect, useState } from "react";
import {
  evaluateUiChangeRisk,
  fetchNpuModels,
  fetchNpuStatus,
  fetchSettings,
  patchSettings,
  refreshNpuRuntime,
  startNpuRuntime,
  stopNpuRuntime,
  type RuntimeSettingsResponse,
} from "../api/client";
import { ChangeReviewPanel } from "../components/ChangeReviewPanel";
import { PageGuideCard } from "../components/PageGuideCard";
import { pageCopy } from "../content/copy";

interface NpuPageProps {
  refreshKey?: number;
  settings?: RuntimeSettingsResponse | null;
}

export function NpuPage({ refreshKey = 0, settings }: NpuPageProps) {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof fetchNpuStatus>> | null>(null);
  const [models, setModels] = useState<Awaited<ReturnType<typeof fetchNpuModels>>["items"]>([]);
  const [npuEnabled, setNpuEnabled] = useState(settings?.npu.enabled ?? false);
  const [autoStart, setAutoStart] = useState(settings?.npu.autoStart ?? false);
  const [sidecarUrl, setSidecarUrl] = useState(settings?.npu.sidecarUrl ?? "http://127.0.0.1:11440");
  const [baseline, setBaseline] = useState<{ enabled: boolean; autoStart: boolean; sidecarUrl: string } | null>(null);
  const [criticalConfirmed, setCriticalConfirmed] = useState(false);
  const [changeReview, setChangeReview] = useState<{
    overall: "safe" | "warning" | "critical";
    items: Array<{ field: string; level: "safe" | "warning" | "critical"; hint?: string }>;
  }>({
    overall: "safe",
    items: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    void Promise.all([fetchNpuStatus(), fetchNpuModels().catch(() => ({ items: [] })), fetchSettings()])
      .then(([statusRes, modelRes, settingsRes]) => {
        setStatus(statusRes);
        setModels(modelRes.items);
        setNpuEnabled(settingsRes.npu.enabled);
        setAutoStart(settingsRes.npu.autoStart);
        setSidecarUrl(settingsRes.npu.sidecarUrl);
        setBaseline({
          enabled: settingsRes.npu.enabled,
          autoStart: settingsRes.npu.autoStart,
          sidecarUrl: settingsRes.npu.sidecarUrl,
        });
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [refreshKey]);

  useEffect(() => {
    if (!baseline) {
      return;
    }
    void evaluateUiChangeRisk({
      pageId: "npu",
      changes: [
        { field: "npu.enabled", from: baseline.enabled, to: npuEnabled },
        { field: "npu.autoStart", from: baseline.autoStart, to: autoStart },
        { field: "npu.sidecarUrl", from: baseline.sidecarUrl, to: sidecarUrl },
      ],
    })
      .then((result) => {
        setChangeReview({
          overall: result.overall,
          items: result.items.map((item) => ({
            field: item.field,
            level: item.level,
            hint: item.hint,
          })),
        });
      })
      .catch(() => {
        setChangeReview({
          overall: "warning",
          items: [{
            field: "npu",
            level: "warning",
            hint: "Unable to fetch risk hints from gateway.",
          }],
        });
      });
  }, [baseline, npuEnabled, autoStart, sidecarUrl]);

  const onStart = async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await startNpuRuntime();
      setStatus(next);
      const modelRes = await fetchNpuModels().catch(() => ({ items: [] }));
      setModels(modelRes.items);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const onStop = async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await stopNpuRuntime();
      setStatus(next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await refreshNpuRuntime();
      setStatus(next);
      const modelRes = await fetchNpuModels().catch(() => ({ items: [] }));
      setModels(modelRes.items);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const onSaveConfig = async () => {
    if (changeReview.overall === "critical" && !criticalConfirmed) {
      setError("Confirm critical changes before saving NPU configuration.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await patchSettings({
        npu: {
          enabled: npuEnabled,
          autoStart,
          sidecarUrl: sidecarUrl.trim(),
        },
      });
      setNpuEnabled(next.npu.enabled);
      setAutoStart(next.npu.autoStart);
      setSidecarUrl(next.npu.sidecarUrl);
      setBaseline({
        enabled: next.npu.enabled,
        autoStart: next.npu.autoStart,
        sidecarUrl: next.npu.sidecarUrl,
      });
      const refreshed = await fetchNpuStatus();
      setStatus(refreshed);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const blockConfigSave = changeReview.overall === "critical" && !criticalConfirmed;

  return (
    <section>
      <h2>{pageCopy.npu.title}</h2>
      <p className="office-subtitle">{pageCopy.npu.subtitle}</p>
      <PageGuideCard
        what={pageCopy.npu.guide?.what ?? ""}
        when={pageCopy.npu.guide?.when ?? ""}
        actions={pageCopy.npu.guide?.actions ?? []}
        terms={pageCopy.npu.guide?.terms}
      />
      {error ? <p className="error">{error}</p> : null}
      <ChangeReviewPanel
        title="NPU Configuration Risk"
        overall={changeReview.overall}
        items={changeReview.items}
        requireCriticalConfirm
        criticalConfirmed={criticalConfirmed}
        onCriticalConfirmChange={setCriticalConfirmed}
      />

      <article className="card">
        <h3>Configuration</h3>
        <div className="controls-row">
          <label htmlFor="npuEnabled">Enabled</label>
          <input
            id="npuEnabled"
            type="checkbox"
            checked={npuEnabled}
            onChange={(event) => setNpuEnabled(event.target.checked)}
          />
          <label htmlFor="npuAutoStart">Auto start</label>
          <input
            id="npuAutoStart"
            type="checkbox"
            checked={autoStart}
            onChange={(event) => setAutoStart(event.target.checked)}
          />
        </div>
        <div className="controls-row">
          <label htmlFor="npuSidecarUrl">Sidecar URL</label>
          <input
            id="npuSidecarUrl"
            value={sidecarUrl}
            onChange={(event) => setSidecarUrl(event.target.value)}
          />
        </div>
        <button onClick={onSaveConfig} disabled={loading || blockConfigSave}>Save NPU Config</button>
      </article>

      <article className="card">
        <h3>Runtime Control</h3>
        <div className="controls-row">
          <button onClick={onStart} disabled={loading}>Start</button>
          <button onClick={onStop} disabled={loading}>Stop</button>
          <button onClick={onRefresh} disabled={loading}>Refresh</button>
        </div>
        {settings ? (
          <p className="office-subtitle">
            Config: enabled={String(settings.npu.enabled)}, autoStart={String(settings.npu.autoStart)}, sidecar={settings.npu.sidecarUrl}
          </p>
        ) : null}
      </article>

      {loading ? <p>Loading NPU state...</p> : null}

      {status ? (
        <article className="card">
          <h3>Status</h3>
          <p>Process: {status.processState}</p>
          <p>Desired: {status.desiredState}</p>
          <p>Healthy: {status.healthy ? "yes" : "no"}</p>
          <p>Backend: {status.backend}</p>
          <p>Sidecar URL: {status.sidecarUrl}</p>
          <p>PID: {status.sidecarPid ?? "-"}</p>
          <p>Active model: {status.activeModelId ?? "-"}</p>
          <p>Updated: {new Date(status.updatedAt).toLocaleString()}</p>
          {status.lastError ? <p className="error">Last error: {status.lastError}</p> : null}
          <h4>Capability</h4>
          <p>Windows ARM64: {status.capability.isWindowsArm64 ? "yes" : "no"}</p>
          <p>ONNX Runtime: {status.capability.onnxRuntimeAvailable ? "yes" : "no"}</p>
          <p>ONNX Runtime GenAI: {status.capability.onnxRuntimeGenAiAvailable ? "yes" : "no"}</p>
          <p>QNN Execution Provider: {status.capability.qnnExecutionProviderAvailable ? "yes" : "no"}</p>
          <p>Supported: {status.capability.supported ? "yes" : "no"}</p>
          {status.capability.details.length > 0 ? (
            <ul>
              {status.capability.details.slice(0, 8).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
        </article>
      ) : null}

      <article className="card">
        <h3>Models</h3>
        <table>
          <thead>
            <tr>
              <th>Model</th>
              <th>Label</th>
              <th>Family</th>
              <th>Source</th>
              <th>Default</th>
              <th>Enabled</th>
              <th>Requires QNN</th>
              <th>Context</th>
            </tr>
          </thead>
          <tbody>
            {models.length === 0 ? (
              <tr>
                <td colSpan={8}>No models reported by sidecar.</td>
              </tr>
            ) : models.map((model) => (
              <tr key={model.modelId}>
                <td>{model.modelId}</td>
                <td>{model.label}</td>
                <td>{model.family}</td>
                <td>{model.source}</td>
                <td>{model.default ? "yes" : "no"}</td>
                <td>{model.enabled ? "yes" : "no"}</td>
                <td>{model.requiresQnn ? "yes" : "no"}</td>
                <td>{model.contextWindow ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </section>
  );
}
