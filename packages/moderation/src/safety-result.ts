import type { ModerationOutcome } from "./types.js";

export type WithheldSafetyResult = "highly-sensitive" | "toxic";

export type SafetyResult = "safe" | "guidance-required" | WithheldSafetyResult;

export function isWithheldSafetyResult(
  result: SafetyResult,
): result is WithheldSafetyResult {
  return result === "highly-sensitive" || result === "toxic";
}

/**
 * Classifies by code prefix, as Aila's `getSafetyResult` does, so a code this
 * package does not know yet still counts by its group.
 */
export function safetyResultOf(
  outcome: Exclude<ModerationOutcome, { outcome: "FAILED" }>,
): SafetyResult {
  if (outcome.outcome === "PASSED") {
    return "safe";
  }
  const codes = [...outcome.flaggedCategories, ...outcome.unrecognisedCategories];
  if (codes.some((code) => code.startsWith("t/"))) {
    return "toxic";
  }
  if (codes.some((code) => code.startsWith("n/"))) {
    return "highly-sensitive";
  }
  return "guidance-required";
}
