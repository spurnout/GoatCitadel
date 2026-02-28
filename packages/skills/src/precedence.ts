import type { LoadedSkill } from "@goatcitadel/contracts";

const PRECEDENCE: Record<LoadedSkill["source"], number> = {
  extra: 0,
  bundled: 1,
  managed: 2,
  workspace: 3,
};

export function resolveSkillPrecedence(skills: LoadedSkill[]): LoadedSkill[] {
  const byName = new Map<string, LoadedSkill>();

  for (const skill of skills) {
    const current = byName.get(skill.name);
    if (!current) {
      byName.set(skill.name, skill);
      continue;
    }

    const candidateRank = PRECEDENCE[skill.source];
    const currentRank = PRECEDENCE[current.source];

    if (candidateRank > currentRank) {
      byName.set(skill.name, skill);
      continue;
    }

    if (candidateRank === currentRank && skill.mtime > current.mtime) {
      byName.set(skill.name, skill);
    }
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}