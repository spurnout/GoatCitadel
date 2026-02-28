export function estimateTokensFromText(input: string): number {
  if (!input) {
    return 0;
  }
  return Math.ceil(input.length / 4);
}

export function truncateByTokenEstimate(input: string, maxTokens: number): string {
  if (maxTokens <= 0 || !input) {
    return "";
  }
  const maxChars = maxTokens * 4;
  if (input.length <= maxChars) {
    return input;
  }
  return `${input.slice(0, Math.max(0, maxChars - 16))}\n...[truncated]`;
}
