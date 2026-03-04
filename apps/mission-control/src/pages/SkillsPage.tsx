import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  BankrActionAuditRecord,
  BankrActionPreviewResponse,
  BankrSafetyPolicy,
  SkillListItem,
  SkillRuntimeState,
} from "@goatcitadel/contracts";
import {
  fetchBankrActionAudit,
  fetchBankrSafetyPolicy,
  fetchSkillImportHistory,
  fetchSkillSources,
  fetchSkills,
  installSkillImport,
  reloadSkills,
  validateSkillImport,
  updateSkillState,
  patchBankrSafetyPolicy,
  previewBankrAction,
  fetchSkillActivationPolicies,
  patchSkillActivationPolicies,
} from "../api/client";
import { PageGuideCard } from "../components/PageGuideCard";
import { HelpHint } from "../components/HelpHint";
import { GCSelect, GCSwitch } from "../components/ui";
import { pageCopy } from "../content/copy";
import { useRefreshSubscription } from "../hooks/useRefreshSubscription";
import { useUiPreferences } from "../state/ui-preferences";

interface SkillActivationPolicyState {
  guardedAutoThreshold: number;
  requireFirstUseConfirmation: boolean;
}

interface BankrPolicyState extends BankrSafetyPolicy {
  allowedChainsText: string;
  blockedSymbolsText: string;
}

const STATE_OPTIONS: SkillRuntimeState[] = ["enabled", "sleep", "disabled"];

export function SkillsPage({ refreshKey: _refreshKey = 0 }: { refreshKey?: number }) {
  const { mode } = useUiPreferences();
  const [skills, setSkills] = useState<SkillListItem[]>([]);
  const [policy, setPolicy] = useState<SkillActivationPolicyState | null>(null);
  const [bankrPolicy, setBankrPolicy] = useState<BankrPolicyState | null>(null);
  const [bankrAudit, setBankrAudit] = useState<BankrActionAuditRecord[]>([]);
  const [bankrPreviewPrompt, setBankrPreviewPrompt] = useState("");
  const [bankrPreviewUsd, setBankrPreviewUsd] = useState("");
  const [bankrPreview, setBankrPreview] = useState<BankrActionPreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busySkillId, setBusySkillId] = useState<string | null>(null);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [savingBankrPolicy, setSavingBankrPolicy] = useState(false);
  const [runningBankrPreview, setRunningBankrPreview] = useState(false);
  const [stateDraftBySkill, setStateDraftBySkill] = useState<Record<string, SkillRuntimeState>>({});
  const [noteDraftBySkill, setNoteDraftBySkill] = useState<Record<string, string>>({});
  const [stateFilter, setStateFilter] = useState<"all" | SkillRuntimeState>("all");
  const [sourceQuery, setSourceQuery] = useState("");
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [sourceItems, setSourceItems] = useState<Array<{
    canonicalKey: string;
    sourceProvider: "agentskill" | "skillsmp" | "github" | "local";
    sourceUrl: string;
    repositoryUrl?: string;
    name: string;
    description: string;
    tags: string[];
    updatedAt?: string;
    alternateProviders: Array<"agentskill" | "skillsmp" | "github" | "local">;
    qualityScore: number;
    freshnessScore: number;
    trustScore: number;
    combinedScore: number;
  }>>([]);
  const [sourceProviders, setSourceProviders] = useState<Array<{
    provider: "agentskill" | "skillsmp" | "github" | "local";
    providerLabel: string;
    available: boolean;
    status: "ok" | "degraded" | "unavailable";
    error?: string;
    latencyMs?: number;
  }>>([]);
  const [importSourceRef, setImportSourceRef] = useState("");
  const [importSourceType, setImportSourceType] = useState<"local_path" | "local_zip" | "git_url">("local_path");
  const [importSourceProvider, setImportSourceProvider] = useState<"local" | "github" | "agentskill" | "skillsmp">("local");
  const [validationResult, setValidationResult] = useState<Awaited<ReturnType<typeof validateSkillImport>> | null>(null);
  const [importHistory, setImportHistory] = useState<Awaited<ReturnType<typeof fetchSkillImportHistory>>["items"]>([]);
  const [importBusy, setImportBusy] = useState<null | "validate" | "install">(null);
  const [confirmHighRiskImport, setConfirmHighRiskImport] = useState(false);

  const load = useCallback(async (options?: { background?: boolean }) => {
    const background = options?.background ?? false;
    if (background) {
      setIsRefreshing(true);
    } else {
      setIsInitialLoading(true);
    }
    try {
      const [skillsResponse, policyResponse, bankrPolicyResponse, bankrAuditResponse, importHistoryResponse] = await Promise.all([
        fetchSkills(),
        fetchSkillActivationPolicies(),
        fetchBankrSafetyPolicy(),
        fetchBankrActionAudit({ limit: 20 }),
        fetchSkillImportHistory(30),
      ]);
      setSkills(skillsResponse.items);
      setPolicy({
        guardedAutoThreshold: policyResponse.guardedAutoThreshold,
        requireFirstUseConfirmation: policyResponse.requireFirstUseConfirmation,
      });
      setBankrPolicy({
        ...bankrPolicyResponse,
        allowedChainsText: bankrPolicyResponse.allowedChains.join(", "),
        blockedSymbolsText: (bankrPolicyResponse.blockedSymbols ?? []).join(", "),
      });
      setBankrAudit(bankrAuditResponse.items);
      setImportHistory(importHistoryResponse.items);
      setStateDraftBySkill(Object.fromEntries(skillsResponse.items.map((skill) => [skill.skillId, skill.state])));
      setNoteDraftBySkill(Object.fromEntries(skillsResponse.items.map((skill) => [skill.skillId, skill.note ?? ""])));
      setBankrPreview(null);
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
  }, []);

  useEffect(() => {
    void load({ background: false });
  }, [load]);

  useRefreshSubscription(
    "skills",
    async () => {
      await load({ background: true });
    },
    {
      enabled: !isInitialLoading,
      coalesceMs: 1100,
      staleMs: 20000,
      pollIntervalMs: 15000,
    },
  );

  const filteredSkills = useMemo(
    () => skills.filter((skill) => stateFilter === "all" ? true : skill.state === stateFilter),
    [skills, stateFilter],
  );

  const onReload = useCallback(async () => {
    try {
      await reloadSkills();
      await load({ background: true });
      setStatus("Skills reloaded.");
    } catch (err) {
      setError((err as Error).message);
    }
  }, [load]);

  const onSavePolicy = useCallback(async () => {
    if (!policy) {
      return;
    }
    setSavingPolicy(true);
    try {
      const updated = await patchSkillActivationPolicies({
        guardedAutoThreshold: policy.guardedAutoThreshold,
        requireFirstUseConfirmation: policy.requireFirstUseConfirmation,
      });
      setPolicy({
        guardedAutoThreshold: updated.guardedAutoThreshold,
        requireFirstUseConfirmation: updated.requireFirstUseConfirmation,
      });
      setStatus("Activation policy saved.");
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingPolicy(false);
    }
  }, [policy]);

  const onSaveBankrPolicy = useCallback(async () => {
    if (!bankrPolicy) {
      return;
    }
    setSavingBankrPolicy(true);
    try {
      const updated = await patchBankrSafetyPolicy({
        enabled: bankrPolicy.enabled,
        mode: bankrPolicy.mode,
        dailyUsdCap: bankrPolicy.dailyUsdCap,
        perActionUsdCap: bankrPolicy.perActionUsdCap,
        requireApprovalEveryWrite: bankrPolicy.requireApprovalEveryWrite,
        allowedChains: splitList(bankrPolicy.allowedChainsText, true),
        allowedActionTypes: bankrPolicy.allowedActionTypes,
        blockedSymbols: splitList(bankrPolicy.blockedSymbolsText, false),
      });
      setBankrPolicy({
        ...updated,
        allowedChainsText: updated.allowedChains.join(", "),
        blockedSymbolsText: (updated.blockedSymbols ?? []).join(", "),
      });
      setStatus("Bankr safety policy saved.");
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingBankrPolicy(false);
    }
  }, [bankrPolicy]);

  const onRunBankrPreview = useCallback(async () => {
    setRunningBankrPreview(true);
    try {
      const usdEstimate = bankrPreviewUsd.trim() ? Number(bankrPreviewUsd.trim()) : undefined;
      const preview = await previewBankrAction({
        prompt: bankrPreviewPrompt.trim() || undefined,
        usdEstimate: Number.isFinite(usdEstimate) ? usdEstimate : undefined,
      });
      setBankrPreview(preview);
      const audit = await fetchBankrActionAudit({ limit: 20 });
      setBankrAudit(audit.items);
      setStatus(
        preview.allowed
          ? "Bankr preview allowed by current policy."
          : `Bankr preview blocked: ${preview.reason}`,
      );
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunningBankrPreview(false);
    }
  }, [bankrPreviewPrompt, bankrPreviewUsd]);

  const onSaveSkillState = useCallback(async (skill: SkillListItem) => {
    const draftState = stateDraftBySkill[skill.skillId] ?? skill.state;
    const draftNote = noteDraftBySkill[skill.skillId] ?? "";
    setBusySkillId(skill.skillId);
    try {
      await updateSkillState(skill.skillId, {
        state: draftState,
        note: draftNote.trim() || undefined,
      });
      await load({ background: true });
      setStatus(`Updated ${skill.name} to ${draftState}.`);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusySkillId(null);
    }
  }, [load, noteDraftBySkill, stateDraftBySkill]);

  const onLoadSources = useCallback(async () => {
    setSourcesLoading(true);
    try {
      const response = await fetchSkillSources({
        q: sourceQuery.trim() || undefined,
        limit: 25,
      });
      setSourceItems(response.items);
      setSourceProviders(response.providers);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSourcesLoading(false);
    }
  }, [sourceQuery]);

  useEffect(() => {
    setSourcesLoading(true);
    void fetchSkillSources({ limit: 25 })
      .then((response) => {
        setSourceItems(response.items);
        setSourceProviders(response.providers);
      })
      .catch((err) => {
        setError((err as Error).message);
      })
      .finally(() => setSourcesLoading(false));
  }, []);

  const onValidateImport = useCallback(async () => {
    const sourceRef = importSourceRef.trim();
    if (!sourceRef) {
      setError("Provide a local path, zip file path, or git URL.");
      return;
    }
    setImportBusy("validate");
    try {
      const validation = await validateSkillImport({
        sourceRef,
        sourceType: importSourceType,
        sourceProvider: importSourceProvider,
      });
      setValidationResult(validation);
      setStatus(validation.valid
        ? `Validation passed (${validation.riskLevel} risk).`
        : "Validation completed with blocking errors.");
      setError(null);
      await load({ background: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImportBusy(null);
    }
  }, [importSourceRef, importSourceType, importSourceProvider, load]);

  const onInstallImport = useCallback(async () => {
    const sourceRef = importSourceRef.trim();
    if (!sourceRef) {
      setError("Provide a source before install.");
      return;
    }
    setImportBusy("install");
    try {
      const installed = await installSkillImport({
        sourceRef,
        sourceType: importSourceType,
        sourceProvider: importSourceProvider,
        confirmHighRisk: confirmHighRiskImport,
        force: false,
      });
      setValidationResult(installed.validation);
      setStatus(
        installed.installedSkillId
          ? `Installed ${installed.installedSkillId}. Skill remains disabled until you enable it.`
          : "Skill installed. Reloaded and kept disabled by default.",
      );
      setError(null);
      await load({ background: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImportBusy(null);
    }
  }, [importSourceRef, importSourceType, importSourceProvider, confirmHighRiskImport, load]);

  if (isInitialLoading) {
    return <p>Loading Playbook skills...</p>;
  }

  return (
    <section>
      <h2>{pageCopy.skills.title}</h2>
      <p className="office-subtitle">{pageCopy.skills.subtitle}</p>
      <PageGuideCard
        what={pageCopy.skills.guide?.what ?? ""}
        when={pageCopy.skills.guide?.when ?? ""}
        actions={pageCopy.skills.guide?.actions ?? []}
        terms={pageCopy.skills.guide?.terms}
      />

      {error ? <p className="error">{error}</p> : null}
      {status ? <p className="status-banner">{status}</p> : null}
      {isRefreshing ? <p className="status-banner">Refreshing skills and Bankr policy...</p> : null}

      <article className="card">
        <h3>What are skills?</h3>
        <p className="table-subtext">
          Skills are reusable instruction packs that teach GoatCitadel how to do specific jobs.
          You can keep a skill off, keep it guarded (sleep), or turn it on.
        </p>
        <ul>
          <li><strong>enabled</strong>: skill can be selected automatically.</li>
          <li><strong>sleep</strong>: skill only auto-runs when confidence is high enough.</li>
          <li><strong>disabled</strong>: skill is ignored until you enable it.</li>
        </ul>
        {mode === "advanced" ? (
          <p className="table-subtext">
            Skills are loaded from local <code>SKILL.md</code> folders and evaluated against activation policy and tool governance before use.
          </p>
        ) : null}
      </article>

      <article className="card">
        <h3>Skill Sources & Import</h3>
        <p className="table-subtext">
          Browse marketplace sources (AgentSkill + SkillsMP), then validate before install.
          Imported skills are always installed in disabled state for safety.
        </p>
        <div className="controls-row">
          <label htmlFor="skillSourceQuery">Search sources</label>
          <input
            id="skillSourceQuery"
            value={sourceQuery}
            onChange={(event) => setSourceQuery(event.target.value)}
            placeholder="browser, github, playwright..."
          />
          <button type="button" onClick={() => void onLoadSources()} disabled={sourcesLoading}>
            {sourcesLoading ? "Searching..." : "Search"}
          </button>
        </div>
        {sourceProviders.length > 0 ? (
          <div className="token-row">
            {sourceProviders.map((provider) => (
              <span
                key={provider.provider}
                className={`token-chip ${provider.available ? "token-chip-active" : ""}`}
                title={provider.error || ""}
              >
                {provider.providerLabel}: {provider.status}
              </span>
            ))}
          </div>
        ) : null}
        <details className="advanced-panel">
          <summary>Marketplace results</summary>
          {sourceItems.length === 0 ? (
            <p className="table-subtext">No source results loaded.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Source</th>
                  <th>Description</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {sourceItems.map((item) => (
                  <tr key={item.canonicalKey}>
                    <td>{item.name}</td>
                    <td>{item.sourceProvider}{item.alternateProviders.length > 0 ? ` (+${item.alternateProviders.join(",")})` : ""}</td>
                    <td>{item.description}</td>
                    <td>{item.combinedScore.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </details>
        <div className="controls-row">
          <label htmlFor="importSourceType">Source type</label>
          <GCSelect
            id="importSourceType"
            value={importSourceType}
            onChange={(value) => setImportSourceType(value as "local_path" | "local_zip" | "git_url")}
            options={[
              { value: "local_path", label: "local_path" },
              { value: "local_zip", label: "local_zip" },
              { value: "git_url", label: "git_url" },
            ]}
          />
          <label htmlFor="importSourceProvider">Source provider</label>
          <GCSelect
            id="importSourceProvider"
            value={importSourceProvider}
            onChange={(value) => setImportSourceProvider(value as "local" | "github" | "agentskill" | "skillsmp")}
            options={[
              { value: "local", label: "local" },
              { value: "github", label: "github" },
              { value: "agentskill", label: "agentskill" },
              { value: "skillsmp", label: "skillsmp" },
            ]}
          />
        </div>
        <div className="controls-row">
          <label htmlFor="importSourceRef">Source ref</label>
          <input
            id="importSourceRef"
            value={importSourceRef}
            onChange={(event) => setImportSourceRef(event.target.value)}
            placeholder={importSourceType === "git_url" ? "https://github.com/owner/repo.git" : importSourceType === "local_zip" ? "F:\\skills\\skill.zip" : "F:\\skills\\my-skill-folder"}
          />
          <button type="button" onClick={() => void onValidateImport()} disabled={importBusy !== null}>
            {importBusy === "validate" ? "Validating..." : "Validate import"}
          </button>
          <button type="button" onClick={() => void onInstallImport()} disabled={importBusy !== null}>
            {importBusy === "install" ? "Installing..." : "Install (disabled by default)"}
          </button>
        </div>
        <GCSwitch
          checked={confirmHighRiskImport}
          onCheckedChange={setConfirmHighRiskImport}
          label="Confirm high-risk import when required"
        />
        {validationResult ? (
          <div className="token-row">
            <span className={`token-chip ${validationResult.valid ? "token-chip-active" : ""}`}>
              {validationResult.valid ? "Validation passed" : "Validation failed"}
            </span>
            <span className="token-chip">Risk: {validationResult.riskLevel}</span>
            {validationResult.inferredSkillName ? (
              <span className="token-chip">Skill: {validationResult.inferredSkillName}</span>
            ) : null}
          </div>
        ) : null}
        {validationResult ? <pre>{JSON.stringify(validationResult, null, 2)}</pre> : null}
        <details className="advanced-panel">
          <summary>Recent import history</summary>
          {importHistory.length === 0 ? (
            <p className="table-subtext">No import history yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Outcome</th>
                  <th>Provider</th>
                  <th>Source</th>
                  <th>Risk</th>
                </tr>
              </thead>
              <tbody>
                {importHistory.map((item) => (
                  <tr key={item.importId}>
                    <td>{new Date(item.createdAt).toLocaleString()}</td>
                    <td>{item.action}</td>
                    <td>{item.outcome}</td>
                    <td>{item.sourceProvider}</td>
                    <td>{item.sourceRef}</td>
                    <td>{item.riskLevel ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </details>
      </article>

      <article className="card">
        <h3>Activation Policy</h3>
        <div className="controls-row">
          <label htmlFor="skillsThreshold">
            Guarded auto threshold
            <HelpHint
              label="Guarded auto threshold help"
              text="Sleep-mode skills only auto-activate when confidence is at or above this threshold."
            />
          </label>
          <input
            id="skillsThreshold"
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={policy?.guardedAutoThreshold ?? 0.72}
            onChange={(event) => {
              const raw = Number(event.target.value);
              const clamped = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0.72;
              setPolicy((current) => current
                ? { ...current, guardedAutoThreshold: clamped }
                : { guardedAutoThreshold: clamped, requireFirstUseConfirmation: true });
            }}
          />
          <GCSwitch
            checked={policy?.requireFirstUseConfirmation ?? true}
            onCheckedChange={(checked) => setPolicy((current) => ({
              guardedAutoThreshold: current?.guardedAutoThreshold ?? 0.72,
              requireFirstUseConfirmation: checked,
            }))}
            label="Require first-use confirmation for sleep skills"
          />
          <button type="button" onClick={() => void onSavePolicy()} disabled={savingPolicy}>
            {savingPolicy ? "Saving..." : "Save policy"}
          </button>
        </div>
      </article>

      <article className="card">
        <h3>Bankr Safety Panel</h3>
        <p className="table-subtext">
          High-risk financial skill. Keep this in <code>sleep</code> by default, use preview first, and require
          explicit approval for every write action.
        </p>
        {bankrPolicy ? (
          <>
            <div className="skills-state-pill-row">
              <span className="token-chip">
                {stateDraftBySkill["managed:bankr"] ?? "unknown"} skill state
              </span>
              <span className="token-chip">
                {bankrPolicy.mode === "read_only" ? "Read-only" : "Read-write guarded"}
              </span>
              <span className="token-chip">
                {bankrPolicy.requireApprovalEveryWrite ? "Write approval required" : "Write approval relaxed"}
              </span>
            </div>
            <div className="controls-row">
              <GCSwitch
                checked={bankrPolicy.enabled}
                onCheckedChange={(checked) => setBankrPolicy((current) => current ? {
                  ...current,
                  enabled: checked,
                } : current)}
                label="Enable Bankr policy controls"
              />
              <label htmlFor="bankrMode">
                Mode
                <HelpHint
                  label="Bankr mode help"
                  text="read_only blocks money-moving actions. read_write still requires explicit approval for writes."
                />
              </label>
              <GCSelect
                id="bankrMode"
                value={bankrPolicy.mode}
                onChange={(value) => setBankrPolicy((current) => current ? {
                  ...current,
                  mode: value as BankrPolicyState["mode"],
                } : current)}
                options={[
                  { value: "read_only", label: "read_only" },
                  { value: "read_write", label: "read_write" },
                ]}
              />
              <GCSwitch
                checked
                disabled
                onCheckedChange={() => undefined}
                label="Require approval on every write (locked on)"
              />
            </div>

            <div className="controls-row">
              <label htmlFor="bankrDailyCap">Daily USD cap</label>
              <input
                id="bankrDailyCap"
                type="number"
                min={1}
                step={1}
                value={bankrPolicy.dailyUsdCap}
                onChange={(event) => setBankrPolicy((current) => current ? {
                  ...current,
                  dailyUsdCap: Math.max(1, Number(event.target.value) || 1),
                } : current)}
              />
              <label htmlFor="bankrPerActionCap">Per-action USD cap</label>
              <input
                id="bankrPerActionCap"
                type="number"
                min={1}
                step={1}
                value={bankrPolicy.perActionUsdCap}
                onChange={(event) => setBankrPolicy((current) => current ? {
                  ...current,
                  perActionUsdCap: Math.max(1, Number(event.target.value) || 1),
                } : current)}
              />
            </div>

            <div className="controls-row">
              <label htmlFor="bankrAllowedChains">Allowed chains (comma-separated)</label>
              <input
                id="bankrAllowedChains"
                value={bankrPolicy.allowedChainsText}
                placeholder="base, ethereum, polygon, solana, unichain"
                onChange={(event) => setBankrPolicy((current) => current ? {
                  ...current,
                  allowedChainsText: event.target.value,
                } : current)}
              />
              <label htmlFor="bankrBlockedSymbols">Blocked symbols (comma-separated)</label>
              <input
                id="bankrBlockedSymbols"
                value={bankrPolicy.blockedSymbolsText}
                placeholder="TOKEN1, TOKEN2"
                onChange={(event) => setBankrPolicy((current) => current ? {
                  ...current,
                  blockedSymbolsText: event.target.value,
                } : current)}
              />
            </div>

            <div className="controls-row">
              <label htmlFor="bankrActionTypes">Allowed write action types</label>
              <div id="bankrActionTypes" className="skills-state-pill-row">
                {(["read", "trade", "transfer", "sign", "submit", "deploy"] as const).map((action) => {
                  const selected = bankrPolicy.allowedActionTypes.includes(action);
                  return (
                    <button
                      key={action}
                      type="button"
                      className={`token-chip ${selected ? "token-chip-active" : ""}`}
                      onClick={() => setBankrPolicy((current) => {
                        if (!current) {
                          return current;
                        }
                        const next = selected
                          ? current.allowedActionTypes.filter((item) => item !== action)
                          : [...current.allowedActionTypes, action];
                        return {
                          ...current,
                          allowedActionTypes: next,
                        };
                      })}
                    >
                      {action}
                    </button>
                  );
                })}
              </div>
              <button type="button" onClick={() => void onSaveBankrPolicy()} disabled={savingBankrPolicy}>
                {savingBankrPolicy ? "Saving..." : "Save Bankr policy"}
              </button>
            </div>

            <details className="advanced-panel">
              <summary>Preview a Bankr action before execution</summary>
              <div className="controls-row">
                <label htmlFor="bankrPreviewPrompt">Prompt</label>
                <input
                  id="bankrPreviewPrompt"
                  value={bankrPreviewPrompt}
                  placeholder="Swap $25 of USDC to ETH on Base"
                  onChange={(event) => setBankrPreviewPrompt(event.target.value)}
                />
                <label htmlFor="bankrPreviewUsd">USD estimate</label>
                <input
                  id="bankrPreviewUsd"
                  type="number"
                  min={0}
                  step={0.01}
                  value={bankrPreviewUsd}
                  onChange={(event) => setBankrPreviewUsd(event.target.value)}
                />
                <button type="button" onClick={() => void onRunBankrPreview()} disabled={runningBankrPreview}>
                  {runningBankrPreview ? "Running..." : "Run preview"}
                </button>
              </div>
              {bankrPreview ? (
                <pre>{JSON.stringify(bankrPreview, null, 2)}</pre>
              ) : null}
            </details>

            <details className="advanced-panel">
              <summary>Recent Bankr audit events</summary>
              {bankrAudit.length === 0 ? <p className="table-subtext">No Bankr audit events yet.</p> : (
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Status</th>
                      <th>Action</th>
                      <th>Chain</th>
                      <th>Symbol</th>
                      <th>USD est</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bankrAudit.map((event) => (
                      <tr key={event.actionId}>
                        <td>{new Date(event.createdAt).toLocaleString()}</td>
                        <td>{event.status}</td>
                        <td>{event.actionType}</td>
                        <td>{event.chain ?? "-"}</td>
                        <td>{event.symbol ?? "-"}</td>
                        <td>{event.usdEstimate ?? "-"}</td>
                        <td>{event.policyReason ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </details>
          </>
        ) : <p>Loading Bankr policy...</p>}
      </article>

      <article className="card">
        <div className="controls-row">
          <h3>Skills</h3>
          <button type="button" onClick={() => void onReload()}>Reload Playbook</button>
          <label htmlFor="skillsFilter">Filter</label>
          <GCSelect
            id="skillsFilter"
            value={stateFilter}
            onChange={(value) => setStateFilter(value as "all" | SkillRuntimeState)}
            options={[
              { value: "all", label: "all" },
              { value: "enabled", label: "enabled" },
              { value: "sleep", label: "sleep" },
              { value: "disabled", label: "disabled" },
            ]}
          />
        </div>

        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Source</th>
              <th>Tools</th>
              <th>Requires</th>
              <th>State</th>
              <th>Note</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredSkills.map((skill) => {
              const draftState = stateDraftBySkill[skill.skillId] ?? skill.state;
              const draftNote = noteDraftBySkill[skill.skillId] ?? "";
              const changed = draftState !== skill.state || draftNote !== (skill.note ?? "");
              return (
                <tr key={skill.skillId}>
                  <td>
                    {skill.name}
                    <div className="table-subtext">{skill.skillId}</div>
                  </td>
                  <td>{skill.source}</td>
                  <td>{skill.declaredTools.join(", ") || "-"}</td>
                  <td>{skill.requires.join(", ") || "-"}</td>
                  <td>
                    <GCSelect
                      value={draftState}
                      onChange={(value) => setStateDraftBySkill((current) => ({
                        ...current,
                        [skill.skillId]: value as SkillRuntimeState,
                      }))}
                      options={STATE_OPTIONS.map((option) => ({ value: option, label: option }))}
                    />
                  </td>
                  <td>
                    <input
                      value={draftNote}
                      placeholder="Optional reason"
                      onChange={(event) => setNoteDraftBySkill((current) => ({
                        ...current,
                        [skill.skillId]: event.target.value,
                      }))}
                    />
                  </td>
                  <td>
                    <button type="button"
                      disabled={!changed || busySkillId === skill.skillId}
                      onClick={() => void onSaveSkillState(skill)}
                    >
                      {busySkillId === skill.skillId ? "Saving..." : "Save"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </article>
    </section>
  );
}

function splitList(value: string, lowercase = false): string[] {
  const out = new Set<string>();
  for (const part of value.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    out.add(lowercase ? trimmed.toLowerCase() : trimmed.toUpperCase());
  }
  return [...out];
}

