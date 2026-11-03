export function resolveSafeRedirectPath(candidate: string | null, fallback = "/"): string {
  if (candidate === null || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return fallback;
  }

  try {
    const parsed = new URL(candidate, "https://local.invalid");
    return parsed.origin === "https://local.invalid"
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}
