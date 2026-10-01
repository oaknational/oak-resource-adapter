/** Stored parameters are jsonb, so their shape is only known once read. */
export function asParams(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Stored transformation parameters are not an object.");
  }
  return value as Readonly<Record<string, unknown>>;
}
