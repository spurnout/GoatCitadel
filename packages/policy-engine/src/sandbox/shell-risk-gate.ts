export interface ShellRiskDecision {
  risky: boolean;
  matchedPattern?: string;
}

export function classifyShellRisk(command: string, riskyPatterns: string[]): ShellRiskDecision {
  const lower = command.toLowerCase();
  for (const pattern of riskyPatterns) {
    if (lower.includes(pattern.toLowerCase())) {
      return {
        risky: true,
        matchedPattern: pattern,
      };
    }
  }

  return { risky: false };
}