import type { LoadedSkill } from "@personal-ai/contracts";

export interface DependencyResolutionResult {
  ordered: LoadedSkill[];
  blocked: Array<{ skill: string; reason: string }>;
}

export function resolveDependencies(initial: LoadedSkill[], all: LoadedSkill[]): DependencyResolutionResult {
  const skillByName = new Map(all.map((skill) => [skill.name, skill] as const));
  const ordered: LoadedSkill[] = [];
  const blocked: Array<{ skill: string; reason: string }> = [];

  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(skill: LoadedSkill, chain: string[]): void {
    if (visited.has(skill.name)) {
      return;
    }

    if (visiting.has(skill.name)) {
      blocked.push({
        skill: skill.name,
        reason: `dependency cycle detected: ${[...chain, skill.name].join(" -> ")}`,
      });
      return;
    }

    visiting.add(skill.name);
    for (const dep of skill.requires) {
      const depSkill = skillByName.get(dep);
      if (!depSkill) {
        blocked.push({
          skill: skill.name,
          reason: `missing dependency: ${dep}`,
        });
        continue;
      }

      visit(depSkill, [...chain, skill.name]);
    }

    visiting.delete(skill.name);
    visited.add(skill.name);
    ordered.push(skill);
  }

  for (const skill of initial) {
    visit(skill, []);
  }

  const dedupOrdered = dedupeByName(ordered);
  return {
    ordered: dedupOrdered,
    blocked,
  };
}

function dedupeByName(items: LoadedSkill[]): LoadedSkill[] {
  const map = new Map<string, LoadedSkill>();
  for (const item of items) {
    map.set(item.name, item);
  }
  return [...map.values()];
}