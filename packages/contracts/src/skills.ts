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

export interface SkillActivationDecision {
  selected: LoadedSkill[];
  reasons: Record<string, string[]>;
  blocked: Array<{ skill: string; reason: string }>;
}

export interface SkillResolveInput {
  text: string;
  explicitSkills?: string[];
}