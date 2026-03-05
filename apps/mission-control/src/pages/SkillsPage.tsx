import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  SkillListItem,
  SkillRuntimeState,
} from "@goatcitadel/contracts";
import {
  fetchSkillImportHistory,
  fetchSkillSources,
  fetchSkills,
  installSkillImport,
  reloadSkills,
  validateSkillImport,
  updateSkillState,
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

const STATE_OPTIONS: SkillRuntimeState[] = ["enabled", "sleep", "disabled"];
export const BANKR_MIGRATION_CARD_TITLE = "Bankr is Optional";
export const BANKR_MIGRATION_DOC_PATH = "docs/OPTIONAL_BANKR_SKILL.md";
export const BANKR_MIGRATION_TEMPLATE_PATH = "templates/skills/bankr-optional/SKILL.md";

export function SkillsPage({ refreshKey: _refreshKey = 0 }: { refreshKey?: number }) {
  const { mode } = useUiPreferences();
  const [skills, setSkills] = useState<SkillListItem[]>([]);
  const [policy, setPolicy] = useState<SkillActivationPolicyState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busySkillId, setBusySkillId] = useState<string | null>(null);
  const [savingPolicy, setSavingPolicy] = useState(false);
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
      const [skillsResponse, policyResponse, importHistoryResponse] = await Promise.all([
        fetchSkills(),
        fetchSkillActivationPolicies(),
        fetchSkillImportHistory(30),
      ]);
      setSkills(skillsResponse.items);
      setPolicy({
        guardedAutoThreshold: policyResponse.guardedAutoThreshold,
        requireFirstUseConfirmation: policyResponse.requireFirstUseConfirmation,
      });
      setImportHistory(importHistoryResponse.items);
      setStateDraftBySkill(Object.fromEntries(skillsResponse.items.map((skill) => [skill.skillId, skill.state])));
      setNoteDraftBySkill(Object.fromEntries(skillsResponse.items.map((skill) => [skill.skillId, skill.note ?? ""])));
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
      {isRefreshing ? <p className="status-banner">Refreshing skills and activation policy...</p> : null}

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
        <h3>{BANKR_MIGRATION_CARD_TITLE}</h3>
        <p className="table-subtext">
          Built-in Bankr support is disabled by default. If you need it, install it as an optional skill pack and keep
          it in <code>disabled</code> or <code>sleep</code> until policy grants are reviewed.
        </p>
        <ul>
          <li>Install guide: <code>{BANKR_MIGRATION_DOC_PATH}</code></li>
          <li>Starter template: <code>{BANKR_MIGRATION_TEMPLATE_PATH}</code></li>
          <li>Legacy built-in endpoints return migration guidance (`410`) while disabled.</li>
        </ul>
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

