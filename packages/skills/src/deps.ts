import type { LoadedSkill } from "@goatcitadel/contracts";

export interface DependencyResolutionResult {
  ordered: LoadedSkill[];
  blocked: Array<{ skill: string; reason: string }>;
}

export function resolveDependencies(initial: LoadedSkill[], all: LoadedSkill[]): DependencyResolutionResult {
  const skillByName = new Map(all.map((skill) => [skill.name, skill] as const));
  const ordered: LoadedSkill[] = [];
  const blocked: Array<{ skill: string; reason: string }> = [];
  const blockedByName = new Set<string>();

  const visiting = new Set<string>();
  const visited = new Set<string>();

  function block(skillName: string, reason: string): void {
    if (blockedByName.has(skillName)) {
      return;
    }
    blockedByName.add(skillName);
    blocked.push({ skill: skillName, reason });
  }

  function visit(skill: LoadedSkill, chain: string[]): boolean {
    if (visited.has(skill.name)) {
      return !blockedByName.has(skill.name);
    }

    if (visiting.has(skill.name)) {
      block(skill.name, `dependency cycle detected: ${[...chain, skill.name].join(" -> ")}`);
      return false;
    }

    visiting.add(skill.name);
    let dependenciesOk = true;
    for (const dep of skill.requires) {
      const depSkill = skillByName.get(dep);
      if (!depSkill) {
        block(skill.name, `missing dependency: ${dep}`);
        dependenciesOk = false;
        continue;
      }

      const depOk = visit(depSkill, [...chain, skill.name]);
      if (!depOk) {
        dependenciesOk = false;
        block(
          skill.name,
          `blocked by dependency ${dep}: ${[...chain, skill.name, dep].join(" -> ")}`,
        );
      }
    }

    visiting.delete(skill.name);
    visited.add(skill.name);
    if (dependenciesOk && !blockedByName.has(skill.name)) {
      ordered.push(skill);
      return true;
    }

    return false;
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
