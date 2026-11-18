import type {
  ModerationCategory,
  ModerationOutcome,
  ModerationRequest,
  SafetyResult,
} from "@oaknational/resource-adapter-moderation";
import { z } from "zod";

export type ScaffoldSubject = Readonly<{
  /** 1 for a transformation's first run; each Try again adds one. */
  attemptNumber: number;
  kind: string;
  lessonSlug: string | null;
}>;

/** The moderation service is never sent the subject. */
export type ScaffoldModerator = Readonly<{
  moderate: (
    request: ModerationRequest & Readonly<{ subject: ScaffoldSubject }>,
  ) => Promise<ModerationOutcome>;
}>;

const results = [
  "safe",
  "guidance-required",
  "highly-sensitive",
  "toxic",
  "failed",
] as const satisfies readonly (SafetyResult | "failed")[];

/**
 * By lesson slug, then transformation kind, the result each attempt reaches in
 * order, the last repeating. Anything unlisted passes.
 */
export const deterministicModerationResultsSchema = z.record(
  z.string(),
  z.record(z.string(), z.array(z.enum(results)).nonempty()),
);

export type DeterministicModerationResults = z.infer<
  typeof deterministicModerationResultsSchema
>;

function flagged(category: ModerationCategory): ModerationOutcome {
  return {
    outcome: "FLAGGED",
    flaggedCategories: [category],
    unrecognisedCategories: [],
    scores: { [category]: 1 },
  };
}

const outcomes: Readonly<Record<(typeof results)[number], ModerationOutcome>> = {
  safe: { outcome: "PASSED", scores: {} },
  "guidance-required": flagged("p/practical-activities"),
  "highly-sensitive": flagged("n/self-harm-suicide"),
  toxic: flagged("t/encourages-violence-harm-others"),
  failed: { outcome: "FAILED", reason: "UPSTREAM_UNAVAILABLE" },
};

export function createDeterministicModerator(
  configured: DeterministicModerationResults,
): ScaffoldModerator {
  return {
    moderate: async ({ signal, subject }) => {
      if (signal?.aborted === true) {
        return { outcome: "FAILED", reason: "ABORTED", cause: signal.reason };
      }
      const sequence =
        subject.lessonSlug === null
          ? undefined
          : configured[subject.lessonSlug]?.[subject.kind];
      const result = sequence?.[Math.min(subject.attemptNumber, sequence.length) - 1];
      return outcomes[result ?? "safe"];
    },
  };
}
