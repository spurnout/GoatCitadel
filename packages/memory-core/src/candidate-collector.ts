import type { MemoryCandidate, MemorySourceInput } from "./types.js";

export interface CandidateCollectorOptions {
  maxTranscriptEvents: number;
  maxFileCandidates: number;
  maxCharsPerCandidate: number;
}

export function collectMemoryCandidates(
  sources: MemorySourceInput[],
  options: CandidateCollectorOptions,
): MemoryCandidate[] {
  const out: MemoryCandidate[] = [];

  for (const source of sources) {
    if (source.type === "transcript") {
      const recent = source.events.slice(-Math.max(0, options.maxTranscriptEvents));
      for (const event of recent) {
        const content = extractTranscriptText(event.payload);
        if (!content) {
          continue;
        }
        out.push({
          candidateId: `t:${event.eventId}`,
          sourceType: "transcript",
          sourceRef: event.eventId,
          text: trimCandidate(content, options.maxCharsPerCandidate),
          timestamp: event.timestamp,
        });
      }
      continue;
    }

    if (out.filter((candidate) => candidate.sourceType === "file").length >= options.maxFileCandidates) {
      continue;
    }

    const chunks = splitIntoChunks(source.content, options.maxCharsPerCandidate);
    for (let index = 0; index < chunks.length; index += 1) {
      if (out.filter((candidate) => candidate.sourceType === "file").length >= options.maxFileCandidates) {
        break;
      }
      const chunk = chunks[index];
      if (!chunk) {
        continue;
      }
      out.push({
        candidateId: `f:${source.relativePath}#${index}`,
        sourceType: "file",
        sourceRef: source.relativePath,
        text: chunk,
        timestamp: source.modifiedAt,
      });
    }
  }

  return out;
}

function extractTranscriptText(payload: Record<string, unknown>): string | undefined {
  const message = payload.message;
  if (typeof message === "string" && message.trim()) {
    return message.trim();
  }

  const content = payload.content;
  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  if (typeof payload === "object") {
    const serialized = JSON.stringify(payload);
    if (serialized && serialized !== "{}") {
      return serialized;
    }
  }
  return undefined;
}

function splitIntoChunks(input: string, maxChars: number): string[] {
  const normalized = input.trim();
  if (!normalized) {
    return [];
  }
  if (normalized.length <= maxChars) {
    return [normalized];
  }

  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < normalized.length) {
    const next = normalized.slice(cursor, cursor + maxChars).trim();
    if (next) {
      chunks.push(next);
    }
    cursor += maxChars;
  }
  return chunks;
}

function trimCandidate(input: string, maxChars: number): string {
  if (input.length <= maxChars) {
    return input;
  }
  return `${input.slice(0, Math.max(0, maxChars - 16))}\n...[truncated]`;
}
