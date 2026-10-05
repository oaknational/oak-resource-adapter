import {
  adaptations,
  getDatabaseClient,
  resourceDocuments,
  suggestedTransformations,
  transformationAttempts,
  transformationInputs,
  transformations,
} from "@oaknational/resource-adapter-db";
import { and, eq, exists, isNotNull, isNull, sql } from "drizzle-orm";

import {
  PRIMARY_SOURCE,
  pendingAttemptOwnsHead,
  type StoredAttempt,
  type StoredSuggestion,
  type StoredTransformation,
  type Transaction,
} from "./shared";

export type PendingReview = Readonly<{
  attempt: StoredAttempt;
  suggestion: StoredSuggestion;
  transformation: StoredTransformation;
}>;

/** Like `pendingAttemptOwnsHead`, but keyed on the transformation and the input it must return to. */
function pendingTransformationOwnsHead(
  transaction: Transaction,
  input: {
    adaptationId: string;
    previousHeadId: string;
    resourceDocumentId: string;
    transformationId: string;
  },
) {
  return transaction
    .select({ id: resourceDocuments.id })
    .from(resourceDocuments)
    .innerJoin(
      transformationAttempts,
      eq(transformationAttempts.id, resourceDocuments.transformationAttemptId),
    )
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
        eq(resourceDocuments.id, input.resourceDocumentId),
        eq(transformations.id, input.transformationId),
        eq(transformations.adaptationId, input.adaptationId),
        eq(transformationInputs.inputRole, PRIMARY_SOURCE),
        eq(transformationInputs.resourceDocumentId, input.previousHeadId),
        isNull(transformationAttempts.acceptedAt),
        isNotNull(transformationAttempts.completedAt),
      ),
    );
}

class PendingReviewConflictError extends Error {}

/** The unaccepted teacher-facing attempt that produced this document, if any. */
export async function getPendingReview(
  resourceDocumentId: string,
): Promise<PendingReview | null> {
  const [row] = await getDatabaseClient()
    .select({
      attempt: transformationAttempts,
      suggestion: suggestedTransformations,
      transformation: transformations,
    })
    .from(resourceDocuments)
    .innerJoin(
      transformationAttempts,
      eq(transformationAttempts.id, resourceDocuments.transformationAttemptId),
    )
    .innerJoin(
      transformations,
      eq(transformations.id, transformationAttempts.transformationId),
    )
    .innerJoin(
      suggestedTransformations,
      eq(suggestedTransformations.acceptedTransformationId, transformations.id),
    )
    .where(
      and(
        eq(resourceDocuments.id, resourceDocumentId),
        isNull(transformationAttempts.acceptedAt),
        isNotNull(transformationAttempts.completedAt),
      ),
    )
    .limit(1);

  return row ?? null;
}

/** Accepts only the pending attempt that still owns the adaptation head. */
export async function acceptPendingReview(input: {
  adaptationId: string;
  attemptId: string;
  expectedHeadId: string;
}): Promise<boolean> {
  try {
    return await getDatabaseClient().transaction(async (transaction) => {
      const [head] = await transaction
        .update(adaptations)
        .set({
          headResourceDocumentId: input.expectedHeadId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(adaptations.id, input.adaptationId),
            eq(adaptations.headResourceDocumentId, input.expectedHeadId),
            exists(
              pendingAttemptOwnsHead(transaction, {
                adaptationId: input.adaptationId,
                attemptId: input.attemptId,
                resourceDocumentId: input.expectedHeadId,
              }),
            ),
          ),
        )
        .returning({ id: adaptations.id });
      if (head === undefined) {
        return false;
      }

      const [accepted] = await transaction
        .update(transformationAttempts)
        .set({ acceptedAt: new Date() })
        .where(
          and(
            eq(transformationAttempts.id, input.attemptId),
            isNull(transformationAttempts.acceptedAt),
            isNotNull(transformationAttempts.completedAt),
          ),
        )
        .returning({ id: transformationAttempts.id });
      if (accepted === undefined) {
        throw new PendingReviewConflictError();
      }
      return true;
    });
  } catch (error) {
    if (error instanceof PendingReviewConflictError) {
      return false;
    }
    throw error;
  }
}

/**
 * Moves an unaccepted head back to its input and discards the transformation that
 * produced it. Deleting the transformation cascades to its attempts and generated
 * document, and sets the offer's `accepted_transformation_id` back to null, which
 * is what reopens it.
 */
export async function undoPendingReview(input: {
  adaptationId: string;
  expectedHeadId: string;
  previousHeadId: string;
  transformationId: string;
}): Promise<boolean> {
  return getDatabaseClient().transaction(async (transaction) => {
    const [updated] = await transaction
      .update(adaptations)
      .set({ headResourceDocumentId: input.previousHeadId, updatedAt: new Date() })
      .where(
        and(
          eq(adaptations.id, input.adaptationId),
          eq(adaptations.headResourceDocumentId, input.expectedHeadId),
          exists(
            pendingTransformationOwnsHead(transaction, {
              adaptationId: input.adaptationId,
              previousHeadId: input.previousHeadId,
              resourceDocumentId: input.expectedHeadId,
              transformationId: input.transformationId,
            }),
          ),
        ),
      )
      .returning({ id: adaptations.id });
    if (updated === undefined) {
      return false;
    }

    const [reopened] = await transaction
      .update(suggestedTransformations)
      .set({ undoCount: sql`${suggestedTransformations.undoCount} + 1` })
      .where(
        eq(suggestedTransformations.acceptedTransformationId, input.transformationId),
      )
      .returning({ id: suggestedTransformations.id });
    if (reopened === undefined) {
      throw new Error("The pending review's suggestion could not be reopened.");
    }
    await transaction
      .delete(transformations)
      .where(eq(transformations.id, input.transformationId));

    return true;
  });
}
