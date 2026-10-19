export function configuredLimit(
  name: string,
  configured: string | undefined,
  fallback: number,
): number {
  const value = configured?.trim() ?? "";
  if (value === "") {
    return fallback;
  }
  const limit = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(limit) || limit < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return limit;
}
