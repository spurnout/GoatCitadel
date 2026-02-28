import type { EffectiveToolPolicy, ToolPolicyConfig } from "@goatcitadel/contracts";

export function resolveEffectivePolicy(config: ToolPolicyConfig, agentId: string): EffectiveToolPolicy {
  const profileName = config.agents[agentId]?.tools?.profile ?? config.tools.profile;
  const profileTools = new Set(config.profiles[profileName] ?? []);

  const allowSet = new Set<string>([
    ...config.tools.allow,
    ...(config.agents[agentId]?.tools?.allow ?? []),
  ]);

  const denySet = new Set<string>([
    ...config.tools.deny,
    ...(config.agents[agentId]?.tools?.deny ?? []),
  ]);

  const effectiveTools = new Set<string>();

  if (profileTools.has("*")) {
    effectiveTools.add("*");
  } else {
    for (const tool of profileTools) {
      effectiveTools.add(tool);
    }
  }

  for (const tool of allowSet) {
    effectiveTools.add(tool);
  }

  for (const denied of denySet) {
    effectiveTools.delete(denied);
  }

  return {
    profile: profileName,
    allowSet,
    denySet,
    effectiveTools,
  };
}

export function isToolAllowed(policy: EffectiveToolPolicy, toolName: string): boolean {
  if (policy.denySet.has(toolName)) {
    return false;
  }

  return policy.effectiveTools.has("*") || policy.effectiveTools.has(toolName);
}