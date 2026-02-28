import type {
  LoadedSkill,
  SkillActivationDecision,
  SkillResolveInput,
} from "@goatcitadel/contracts";
import { resolveDependencies } from "./deps.js";

export function resolveSkillActivation(
  input: SkillResolveInput,
  allSkills: LoadedSkill[],
): SkillActivationDecision {
  const text = input.text.toLowerCase();
  const explicit = new Set<string>(input.explicitSkills ?? extractExplicitSkills(input.text));

  const selectedBase: LoadedSkill[] = [];
  const reasons: Record<string, string[]> = {};

  for (const skill of allSkills) {
    const skillReasons: string[] = [];

    if (explicit.has(skill.name.toLowerCase())) {
      skillReasons.push("explicit");
    }

    const keywordMatch = skill.keywords.some((keyword) => text.includes(keyword.toLowerCase()));
    if (keywordMatch) {
      skillReasons.push("keyword");
    }

    if (skillReasons.length > 0) {
      selectedBase.push(skill);
      reasons[skill.name] = skillReasons;
    }
  }

  const dependencyResult = resolveDependencies(selectedBase, allSkills);
  for (const depSkill of dependencyResult.ordered) {
    if (!reasons[depSkill.name]) {
      reasons[depSkill.name] = ["dependency"];
    }
  }

  return {
    selected: dependencyResult.ordered,
    reasons,
    blocked: dependencyResult.blocked,
  };
}

function extractExplicitSkills(text: string): string[] {
  const names = new Set<string>();
  const lower = text.toLowerCase();

  for (const token of lower.matchAll(/@skill\s+([a-z0-9_-]+)/g)) {
    if (token[1]) {
      names.add(token[1]);
    }
  }

  for (const token of lower.matchAll(/\buse\s+([a-z0-9_-]+)\b/g)) {
    if (token[1]) {
      names.add(token[1]);
    }
  }

  return [...names];
}