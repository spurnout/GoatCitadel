import type { ChatMessageRecord } from "@goatcitadel/contracts";

const CHAT_COMPACTION_MAX_ARTIFACTS = 8;

export function buildConversationCompactionSummary(messages: ChatMessageRecord[]): string | undefined {
  const normalized = messages
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }))
    .filter((message) => message.content.length > 0);
  if (normalized.length === 0) {
    return undefined;
  }

  const decisionLines = normalized
    .filter((message) => /(decid|choose|selected|plan|fix|implement|resolved|prefer|must|avoid|do not|don't|should)/i.test(message.content))
    .slice(-6)
    .map((message) => `- ${toTitleCase(message.role)}: ${truncateSummaryLine(message.content)}`);
  const failureLines = normalized
    .filter((message) => /(fail|error|timeout|blocked|could not|couldn't|retry|regression|problem|bug|denied|abort)/i.test(message.content))
    .slice(-6)
    .map((message) => `- ${toTitleCase(message.role)}: ${truncateSummaryLine(message.content)}`);
  const recentLines = normalized
    .slice(-6)
    .map((message) => `- ${toTitleCase(message.role)}: ${truncateSummaryLine(message.content)}`);
  const artifacts = extractCompactionArtifacts(normalized.map((message) => message.content));

  const sections = [
    "Compacted conversation context.",
    decisionLines.length > 0 ? ["Decisions and constraints:", ...decisionLines].join("\n") : undefined,
    failureLines.length > 0 ? ["Failed attempts and issues:", ...failureLines].join("\n") : undefined,
    artifacts.length > 0 ? ["Notable artifacts:", ...artifacts.map((artifact) => `- ${artifact}`)].join("\n") : undefined,
    ["Recent context:", ...recentLines].join("\n"),
  ].filter((section): section is string => Boolean(section));

  return sections.join("\n\n");
}

function extractCompactionArtifacts(contents: string[]): string[] {
  const collected: string[] = [];
  const pushArtifact = (value: string) => {
    const normalized = value.trim();
    if (!normalized || collected.includes(normalized)) {
      return;
    }
    collected.push(normalized);
  };
  for (const content of contents) {
    for (const match of content.matchAll(/\b[a-z]:\\[^\s`"'<>]+/gi)) {
      pushArtifact(match[0]);
    }
    for (const match of content.matchAll(/\bhttps?:\/\/[^\s`"'<>]+/gi)) {
      pushArtifact(match[0]);
    }
    for (const match of content.matchAll(/`([^`\n]{3,160})`/g)) {
      pushArtifact(match[1] ?? "");
    }
    for (const match of content.matchAll(/\b[A-Z][A-Z0-9_]{2,}\b/g)) {
      pushArtifact(match[0]);
    }
    if (collected.length >= CHAT_COMPACTION_MAX_ARTIFACTS) {
      break;
    }
  }
  return collected.slice(0, CHAT_COMPACTION_MAX_ARTIFACTS);
}

function truncateSummaryLine(content: string, maxLength = 220): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function toTitleCase(value: string): string {
  return value
    .split(/[\s_-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
