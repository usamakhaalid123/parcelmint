function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export function loadLocalEnvironmentFile(path = ".env.local"): void {
  try {
    process.loadEnvFile(path);
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }
}
