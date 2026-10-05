import type { JobJsonValue } from "../jobs/domain";

/** Stored parameters are jsonb, so their shape is only known once read. */
export function asParams(value: unknown): Readonly<Record<string, JobJsonValue>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Stored transformation parameters are not an object.");
  }
  return value as Readonly<Record<string, JobJsonValue>>;
}
