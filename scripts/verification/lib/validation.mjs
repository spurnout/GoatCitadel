export function createVerificationRunManifest(input) {
  return {
    runId: String(input.runId),
    lane: String(input.lane),
    startedAt: String(input.startedAt),
    finishedAt: input.finishedAt ? String(input.finishedAt) : undefined,
    durationMs: typeof input.durationMs === "number" ? input.durationMs : undefined,
    status: input.status ?? "running",
    repoRoot: String(input.repoRoot),
    artifactRoot: String(input.artifactRoot),
    metadata: typeof input.metadata === "object" && input.metadata !== null ? input.metadata : {},
    counts: {
      passed: Number(input.counts?.passed ?? 0),
      failed: Number(input.counts?.failed ?? 0),
      skipped: Number(input.counts?.skipped ?? 0),
      degraded: Number(input.counts?.degraded ?? 0),
      notConfigured: Number(input.counts?.notConfigured ?? 0),
    },
    scenarios: Array.isArray(input.scenarios) ? input.scenarios : [],
  };
}

export function validateVerificationReview(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid verification review payload.");
  }
  if (!Array.isArray(input.items)) {
    throw new Error("Verification review items must be an array.");
  }
  return {
    runId: String(input.runId),
    generatedAt: String(input.generatedAt),
    status: input.status === "ok" ? "ok" : "issues_found",
    items: input.items.map((item) => ({
      scenarioId: String(item.scenarioId),
      title: String(item.title),
      subsystem: String(item.subsystem),
      severity: item.severity,
      family: item.family,
      summary: String(item.summary),
      likelySurfaces: Array.isArray(item.likelySurfaces) ? item.likelySurfaces.map(String) : [],
      artifacts: Array.isArray(item.artifacts) ? item.artifacts.map(String) : [],
      checklist: Array.isArray(item.checklist) ? item.checklist.map(String) : [],
    })),
    summary: {
      totalFailures: Number(input.summary?.totalFailures ?? 0),
      critical: Number(input.summary?.critical ?? 0),
      high: Number(input.summary?.high ?? 0),
      medium: Number(input.summary?.medium ?? 0),
      low: Number(input.summary?.low ?? 0),
    },
  };
}

export function validateVerificationRepairPlan(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid verification repair plan payload.");
  }
  return {
    runId: String(input.runId),
    generatedAt: String(input.generatedAt),
    mode: input.mode === "ai_assisted" ? "ai_assisted" : "deterministic",
    summary: String(input.summary),
    priorities: Array.isArray(input.priorities) ? input.priorities.map(String) : [],
    recommendedReruns: Array.isArray(input.recommendedReruns) ? input.recommendedReruns.map(String) : [],
    rawModelOutput: typeof input.rawModelOutput === "string" ? input.rawModelOutput : undefined,
  };
}
