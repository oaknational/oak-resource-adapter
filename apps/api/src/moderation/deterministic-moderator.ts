import type {
  ModerationCategory,
  ModerationOutcome,
  Moderator,
} from "@oaknational/resource-adapter-moderation";

/**
 * Text the deterministic model's canned scaffolds carry, so a browser test
 * reaches each moderation result by choosing a scaffold. The guidance trigger
 * is shown to the teacher, so it reads as ordinary content; the others are
 * never shown.
 */
export const deterministicModerationTriggers = {
  guidance: "Bunsen burner",
  highlySensitive: "oak-hs",
  toxic: "oak-tox",
  failure: "oak-fail",
} as const;

function flagged(category: ModerationCategory): ModerationOutcome {
  return {
    outcome: "FLAGGED",
    flaggedCategories: [category],
    unrecognisedCategories: [],
    scores: { [category]: 1 },
  };
}

function outcomeFor(content: string): ModerationOutcome {
  const triggers = deterministicModerationTriggers;
  if (content.includes(triggers.failure)) {
    return { outcome: "FAILED", reason: "UPSTREAM_UNAVAILABLE" };
  }
  if (content.includes(triggers.toxic)) {
    return flagged("t/encourages-violence-harm-others");
  }
  if (content.includes(triggers.highlySensitive)) {
    return flagged("n/self-harm-suicide");
  }
  if (content.includes(triggers.guidance)) {
    return flagged("p/practical-activities");
  }
  return { outcome: "PASSED", scores: {} };
}

export const deterministicModerator: Moderator = {
  moderate: async ({ content, signal }) =>
    signal?.aborted === true
      ? { outcome: "FAILED", reason: "ABORTED", cause: signal.reason }
      : outcomeFor(content),
};
