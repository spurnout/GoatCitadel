import type { MemoryCitation } from "@goatcitadel/contracts";
import type { MemoryCandidate } from "./types.js";

export function validateCitations(
  citations: MemoryCitation[],
  candidates: MemoryCandidate[],
): { valid: boolean; invalidIds: string[] } {
  const allowed = new Set(candidates.map((candidate) => candidate.candidateId));
  const invalidIds: string[] = [];
  for (const citation of citations) {
    if (!allowed.has(citation.candidateId)) {
      invalidIds.push(citation.candidateId);
    }
  }
  return {
    valid: invalidIds.length === 0,
    invalidIds,
  };
}
