function wildcardToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

export function isHostAllowed(hostOrUrl: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) {
    return false;
  }

  let host = hostOrUrl;
  try {
    host = new URL(hostOrUrl).host;
  } catch {
    host = hostOrUrl;
  }

  return allowlist.some((pattern) => wildcardToRegex(pattern).test(host));
}

export function assertHostAllowed(hostOrUrl: string, allowlist: string[]): void {
  if (!isHostAllowed(hostOrUrl, allowlist)) {
    throw new Error(`Host not on allowlist: ${hostOrUrl}`);
  }
}