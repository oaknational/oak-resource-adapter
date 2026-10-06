import {
  supportLevels,
  type SupportLevel,
} from "@oaknational/resource-adapter-contracts/internal";

import type { JobJsonValue } from "../jobs/domain";

/** Stored parameters are jsonb, so their shape is only known once read. */
export function asParams(value: unknown): Readonly<Record<string, JobJsonValue>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Stored transformation parameters are not an object.");
  }
  return value as Readonly<Record<string, JobJsonValue>>;
}

/** A transformation without a support-level choice stores none. */
export function storedSupportLevel(value: unknown): SupportLevel | null {
  const level =
    typeof value === "object" && value !== null && "supportLevel" in value
      ? value.supportLevel
      : null;
  return supportLevels.find((candidate) => candidate === level) ?? null;
}
