import {
  getDatabaseClient,
  suggestedTransformations,
  transformationAttempts,
  transformationInputs,
  transformations,
} from "@oaknational/resource-adapter-db";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";

import { SUGGESTION_OPERATION_KIND } from "../capability";
import {
  markAttemptComplete,
  type StoredSuggestion,
  type StoredTransformation,
} from "./shared";

export async function listOpenSuggestions(
  resourceDocumentId: string,
): Promise<readonly StoredSuggestion[]> {
  const [latestAttempt] = await getDatabaseClient()
    .select({ id: transformationAttempts.id })
    .from(transformationAttempts)
    .innerJoin(
      transformations,
      eq(transformations.id, transformationAttempts.transformationId),
    )
    .innerJoin(
      transformationInputs,
      eq(transformationInputs.transformationId, transformations.id),
    )
    .where(
      and(
        eq(transformations.kind, SUGGESTION_OPERATION_KIND),
        eq(transformationInputs.resourceDocumentId, resourceDocumentId),
        isNotNull(transformationAttempts.completedAt),
      ),
    )
    .orderBy(desc(transformationAttempts.attemptNumber))
    .limit(1);

  if (latestAttempt === undefined) {
    return [];
  }

  const rows = await getDatabaseClient()
    .select({ suggestion: suggestedTransformations })
    .from(suggestedTransformations)
    .where(
      and(
        eq(suggestedTransformations.transformationAttemptId, latestAttempt.id),
        eq(suggestedTransformations.resourceDocumentId, resourceDocumentId),
        isNull(suggestedTransformations.acceptedTransformationId),
      ),
    )
    .orderBy(suggestedTransformations.position);

  return rows.map(({ suggestion }) => suggestion);
}

export async function getOpenSuggestion(
  suggestionId: string,
  resourceDocumentId: string,
): Promise<StoredSuggestion | null> {
  const open = await listOpenSuggestions(resourceDocumentId);
  return open.find((suggestion) => suggestion.id === suggestionId) ?? null;
}

export async function findSuggestionGeneration(
  resourceDocumentId: string,
): Promise<StoredTransformation | null> {
  const [row] = await getDatabaseClient()
    .select({ transformation: transformations })
    .from(transformations)
    .innerJoin(
      transformationInputs,
      eq(transformationInputs.transformationId, transformations.id),
    )
    .where(
      and(
        eq(transformations.kind, SUGGESTION_OPERATION_KIND),
        eq(transformationInputs.resourceDocumentId, resourceDocumentId),
      ),
    )
    .limit(1);

  return row?.transformation ?? null;
}

export async function completeSuggestionAttempt(input: {
  attemptId: string;
  resourceDocumentId: string;
  suggestions: readonly {
    kind: string;
    params: Readonly<Record<string, unknown>>;
    reason: string;
    targetBlockId: string | null;
  }[];
}): Promise<void> {
  await getDatabaseClient().transaction(async (transaction) => {
    if (input.suggestions.length > 0) {
      await transaction.insert(suggestedTransformations).values(
        input.suggestions.map((suggestion, position) => ({
          kind: suggestion.kind,
          params: suggestion.params,
          position,
          reason: suggestion.reason,
          resourceDocumentId: input.resourceDocumentId,
          targetBlockId: suggestion.targetBlockId,
          transformationAttemptId: input.attemptId,
        })),
      );
    }
    await markAttemptComplete(transaction, input.attemptId);
  });
}
