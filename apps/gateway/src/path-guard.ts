export function isSuspiciousEncodedPath(rawUrl: string): boolean {
  const pathOnly = rawUrl.split("?")[0] ?? "";
  const lower = pathOnly.toLowerCase();
  if (/%00/.test(lower) || /%2f|%5c/.test(lower)) {
    return true;
  }

  const decoded = decodePathSafely(pathOnly);
  if (!decoded) {
    return true;
  }
  const normalized = decoded.replaceAll("\\", "/");
  return normalized.includes("/../")
    || normalized.startsWith("../")
    || normalized.endsWith("/..");
}

function decodePathSafely(value: string): string | undefined {
  let current = value;
  for (let pass = 0; pass < 3; pass += 1) {
    try {
      const next = decodeURIComponent(current);
      if (next === current) {
        return current;
      }
      current = next;
    } catch {
      return undefined;
    }
  }
  return current;
}
