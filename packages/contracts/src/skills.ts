export interface SkillFrontmatter {
  name: string;
  description: string;
  metadata?: {
    version?: string;
    tags?: string[];
    tools?: string[];
    requires?: string[];
    keywords?: string[];
  };
}

export interface LoadedSkill {
  skillId: string;
  name: string;
  source: "bundled" | "managed" | "workspace" | "extra";
  dir: string;
  declaredTools: string[];
  requires: string[];
  keywords: string[];
  instructionBody: string;
  mtime: string;
}

export type SkillRuntimeState = "enabled" | "sleep" | "disabled";

export interface SkillStateRecord {
  skillId: string;
  state: SkillRuntimeState;
  note?: string;
  updatedAt: string;
  firstAutoApprovedAt?: string;
}

export interface SkillActivationPolicy {
  guardedAutoThreshold: number;
  requireFirstUseConfirmation: boolean;
}

export interface SkillListItem extends LoadedSkill {
  state: SkillRuntimeState;
  note?: string;
  stateUpdatedAt?: string;
}

export interface SkillActivationDecision {
  selected: Array<
    LoadedSkill & {
      state: SkillRuntimeState;
      confidence: number;
      requiresConfirmation: boolean;
    }
  >;
  reasons: Record<string, string[]>;
  blocked: Array<{ skill: string; reason: string }>;
  suppressed: Array<{
    skill: string;
    state: SkillRuntimeState;
    confidence: number;
    reason: string;
  }>;
}

export interface SkillResolveInput {
  text: string;
  explicitSkills?: string[];
}
