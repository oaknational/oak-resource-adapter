import {
  createModerator,
  moderationConfigFromEnv,
  type ModerationOutcome,
} from "@oaknational/resource-adapter-moderation";
import { loadOriginalResourceDocumentFixture } from "@oaknational/resource-adapter-original-resource-documents/fixtures";
import { resourceDocumentToPlainText } from "@oaknational/resource-document";

export const MODERATION_SMOKE_CASES = ["expected-pass", "expected-flag"] as const;

export type ModerationSmokeCase = (typeof MODERATION_SMOKE_CASES)[number];

export const EXPECTED_FLAG_TEXT =
  "In this practical, pupils heat copper sulfate solution over a Bunsen burner, then cut out card shapes with a craft knife.";

export type ModerationSmokeResult = Readonly<{
  outcome: ModerationOutcome["outcome"];
  flaggedCategories: readonly string[];
  unrecognisedCategories: readonly string[];
  promptVersion: string | null;
  reason: string | null;
}>;

export class ModerationNotConfiguredError extends Error {}

async function smokeContent(smokeCase: ModerationSmokeCase): Promise<string> {
  switch (smokeCase) {
    case "expected-pass": {
      const { expectedDocument } = await loadOriginalResourceDocumentFixture(
        "linear-equations-smoke",
      );
      return resourceDocumentToPlainText(expectedDocument);
    }
    case "expected-flag":
      return EXPECTED_FLAG_TEXT;
  }
}

function toSmokeResult(outcome: ModerationOutcome): ModerationSmokeResult {
  switch (outcome.outcome) {
    case "PASSED":
      return {
        outcome: outcome.outcome,
        flaggedCategories: [],
        unrecognisedCategories: [],
        promptVersion: outcome.promptVersion,
        reason: null,
      };
    case "FLAGGED":
      return {
        outcome: outcome.outcome,
        flaggedCategories: outcome.flaggedCategories,
        unrecognisedCategories: outcome.unrecognisedCategories,
        promptVersion: outcome.promptVersion,
        reason: null,
      };
    case "FAILED":
      return {
        outcome: outcome.outcome,
        flaggedCategories: [],
        unrecognisedCategories: [],
        promptVersion: null,
        reason: outcome.reason,
      };
  }
}

export async function runModerationSmokeCase(
  smokeCase: ModerationSmokeCase,
): Promise<ModerationSmokeResult> {
  let moderator;
  try {
    moderator = createModerator(moderationConfigFromEnv(process.env));
  } catch (error) {
    throw new ModerationNotConfiguredError(
      "The moderation service is not configured.",
      {
        cause: error,
      },
    );
  }

  return toSmokeResult(
    await moderator.moderate({ content: await smokeContent(smokeCase) }),
  );
}
