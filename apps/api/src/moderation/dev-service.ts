import type {
  ModerationSmokeCase,
  ModerationSmokeResponse,
} from "@oaknational/resource-adapter-dev-api-contracts";
import {
  createModerator,
  moderationConfigFromEnv,
  type ModerationOutcome,
} from "@oaknational/resource-adapter-moderation";
import { loadOriginalResourceDocumentFixture } from "@oaknational/resource-adapter-original-resource-documents/fixtures";
import { resourceDocumentToPlainText } from "@oaknational/resource-document";

export const EXPECTED_FLAG_TEXT =
  "In this practical, pupils heat copper sulfate solution over a Bunsen burner, then cut out card shapes with a craft knife.";

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

function toSmokeResult(outcome: ModerationOutcome): ModerationSmokeResponse {
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
): Promise<ModerationSmokeResponse> {
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
