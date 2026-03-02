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
  fetchSkills,
  reloadSkills,
  updateSkillState,
  patchBankrSafetyPolicy,
  previewBankrAction,
  fetchSkillActivationPolicies,
  patchSkillActivationPolicies,
} from "../api/client";
import { PageGuideCard } from "../components/PageGuideCard";
import { HelpHint } from "../components/HelpHint";
import { pageCopy } from "../content/copy";

interface SkillActivationPolicyState {
  guardedAutoThreshold: number;
  requireFirstUseConfirmation: boolean;
}

interface BankrPolicyState extends BankrSafetyPolicy {
  allowedChainsText: string;
  blockedSymbolsText: string;
}

const STATE_OPTIONS: SkillRuntimeState[] = ["enabled", "sleep", "disabled"];

export function SkillsPage({ refreshKey = 0 }: { refreshKey?: number }) {
  const [skills, setSkills] = useState<SkillListItem[]>([]);
  const [policy, setPolicy] = useState<SkillActivationPolicyState | null>(null);
  const [bankrPolicy, setBankrPolicy] = useState<BankrPolicyState | null>(null);
  const [bankrAudit, setBankrAudit] = useState<BankrActionAuditRecord[]>([]);
  const [bankrPreviewPrompt, setBankrPreviewPrompt] = useState("");
  const [bankrPreviewUsd, setBankrPreviewUsd] = useState("");
  const [bankrPreview, setBankrPreview] = useState<BankrActionPreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busySkillId, setBusySkillId] = useState<string | null>(null);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [savingBankrPolicy, setSavingBankrPolicy] = useState(false);
  const [runningBankrPreview, setRunningBankrPreview] = useState(false);
  const [stateDraftBySkill, setStateDraftBySkill] = useState<Record<string, SkillRuntimeState>>({});
  const [noteDraftBySkill, setNoteDraftBySkill] = useState<Record<string, string>>({});
  const [stateFilter, setStateFilter] = useState<"all" | SkillRuntimeState>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [skillsResponse, policyResponse, bankrPolicyResponse, bankrAuditResponse] = await Promise.all([
        fetchSkills(),
        fetchSkillActivationPolicies(),
        fetchBankrSafetyPolicy(),
        fetchBankrActionAudit({ limit: 20 }),
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
      setStateDraftBySkill(Object.fromEntries(skillsResponse.items.map((skill) => [skill.skillId, skill.state])));
      setNoteDraftBySkill(Object.fromEntries(skillsResponse.items.map((skill) => [skill.skillId, skill.note ?? ""])));
      setBankrPreview(null);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const filteredSkills = useMemo(
    () => skills.filter((skill) => stateFilter === "all" ? true : skill.state === stateFilter),
    [skills, stateFilter],
  );

  const onReload = useCallback(async () => {
    try {
      await reloadSkills();
      await load();
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
      await load();
      setStatus(`Updated ${skill.name} to ${draftState}.`);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusySkillId(null);
    }
  }, [load, noteDraftBySkill, stateDraftBySkill]);

  if (loading) {
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
          <label className="checkbox-inline">
            <input
              type="checkbox"
              checked={policy?.requireFirstUseConfirmation ?? true}
              onChange={(event) => setPolicy((current) => ({
                guardedAutoThreshold: current?.guardedAutoThreshold ?? 0.72,
                requireFirstUseConfirmation: event.target.checked,
              }))}
            />
            Require first-use confirmation for sleep skills
          </label>
          <button onClick={() => void onSavePolicy()} disabled={savingPolicy}>
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
              <label className="checkbox-inline">
                <input
                  type="checkbox"
                  checked={bankrPolicy.enabled}
                  onChange={(event) => setBankrPolicy((current) => current ? {
                    ...current,
                    enabled: event.target.checked,
                  } : current)}
                />
                Enable Bankr policy controls
              </label>
              <label htmlFor="bankrMode">
                Mode
                <HelpHint
                  label="Bankr mode help"
                  text="read_only blocks money-moving actions. read_write still requires explicit approval for writes."
                />
              </label>
              <select
                id="bankrMode"
                value={bankrPolicy.mode}
                onChange={(event) => setBankrPolicy((current) => current ? {
                  ...current,
                  mode: event.target.value as BankrPolicyState["mode"],
                } : current)}
              >
                <option value="read_only">read_only</option>
                <option value="read_write">read_write</option>
              </select>
              <label className="checkbox-inline">
                <input
                  type="checkbox"
                  checked
                  disabled
                  aria-label="Write approvals are mandatory in high-safety mode"
                />
                Require approval on every write (locked on)
              </label>
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
              <button onClick={() => void onSaveBankrPolicy()} disabled={savingBankrPolicy}>
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
                <button onClick={() => void onRunBankrPreview()} disabled={runningBankrPreview}>
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
          <button onClick={() => void onReload()}>Reload Playbook</button>
          <label htmlFor="skillsFilter">Filter</label>
          <select
            id="skillsFilter"
            value={stateFilter}
            onChange={(event) => setStateFilter(event.target.value as "all" | SkillRuntimeState)}
          >
            <option value="all">all</option>
            <option value="enabled">enabled</option>
            <option value="sleep">sleep</option>
            <option value="disabled">disabled</option>
          </select>
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
                    <select
                      value={draftState}
                      onChange={(event) => setStateDraftBySkill((current) => ({
                        ...current,
                        [skill.skillId]: event.target.value as SkillRuntimeState,
                      }))}
                    >
                      {STATE_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
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
                    <button
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
