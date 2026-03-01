import { useCallback, useEffect, useMemo, useState } from "react";
import type { SkillListItem, SkillRuntimeState } from "@goatcitadel/contracts";
import {
  fetchSkills,
  reloadSkills,
  updateSkillState,
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

const STATE_OPTIONS: SkillRuntimeState[] = ["enabled", "sleep", "disabled"];

export function SkillsPage({ refreshKey = 0 }: { refreshKey?: number }) {
  const [skills, setSkills] = useState<SkillListItem[]>([]);
  const [policy, setPolicy] = useState<SkillActivationPolicyState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busySkillId, setBusySkillId] = useState<string | null>(null);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [stateDraftBySkill, setStateDraftBySkill] = useState<Record<string, SkillRuntimeState>>({});
  const [noteDraftBySkill, setNoteDraftBySkill] = useState<Record<string, string>>({});
  const [stateFilter, setStateFilter] = useState<"all" | SkillRuntimeState>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [skillsResponse, policyResponse] = await Promise.all([
        fetchSkills(),
        fetchSkillActivationPolicies(),
      ]);
      setSkills(skillsResponse.items);
      setPolicy({
        guardedAutoThreshold: policyResponse.guardedAutoThreshold,
        requireFirstUseConfirmation: policyResponse.requireFirstUseConfirmation,
      });
      setStateDraftBySkill(Object.fromEntries(skillsResponse.items.map((skill) => [skill.skillId, skill.state])));
      setNoteDraftBySkill(Object.fromEntries(skillsResponse.items.map((skill) => [skill.skillId, skill.note ?? ""])));
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
