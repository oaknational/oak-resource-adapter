export function readDatabaseErrorCode(error: unknown): string | undefined {
  const visited = new Set<object>();

  // DrizzleQueryError keeps the driver's code on its cause, not on itself.
  while (typeof error === "object" && error !== null && !visited.has(error)) {
    visited.add(error);
    if ("code" in error && typeof error.code === "string") {
      return error.code;
    }
    error = "cause" in error ? error.cause : undefined;
  }

  return undefined;
}
