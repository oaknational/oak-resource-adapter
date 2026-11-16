import {
  isWithheldSafetyResult,
  safetyResultOf,
  type Moderator,
} from "@oaknational/resource-adapter-moderation";
import {
  contributedNodes,
  resourceNodesToPlainText,
  type ResourceDocument,
} from "@oaknational/resource-document";

import type { ShownModeration, WithheldModeration } from "./repository";

export type ScaffoldModeration =
  | Readonly<{ shown: true; moderation: ShownModeration }>
  | Readonly<{ shown: false; moderation: WithheldModeration }>;

/**
 * Moderates only what this contribution added, so the rest of the worksheet
 * cannot hide or cause a flag. The content and the service's reply never reach
 * a log or an error message.
 */
export async function moderateScaffold(
  moderator: Moderator,
  input: Readonly<{
    adaptationId: string;
    attemptId: string;
    contributionId: string;
    document: ResourceDocument;
  }>,
): Promise<ScaffoldModeration> {
  const content = resourceNodesToPlainText(
    contributedNodes(input.document, input.contributionId),
    input.document.assets,
  );
  if (content === "") {
    throw new Error("The generated scaffold has no text to moderate.");
  }

  const outcome = await moderator.moderate({
    content,
    context: { sessionId: input.adaptationId, messageId: input.attemptId },
  });
  if (outcome.outcome === "FAILED") {
    throw new Error(`Moderating the generated scaffold failed: ${outcome.reason}.`);
  }

  const result = safetyResultOf(outcome);
  const categories =
    outcome.outcome === "PASSED"
      ? []
      : [...outcome.flaggedCategories, ...outcome.unrecognisedCategories];
  return isWithheldSafetyResult(result)
    ? { shown: false, moderation: { result, categories } }
    : { shown: true, moderation: { result, categories } };
}
