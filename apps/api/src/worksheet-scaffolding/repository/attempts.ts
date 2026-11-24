import {
  adaptations,
  getDatabaseClient,
  resourceDocuments,
  suggestedTransformations,
  transformationAttempts,
  transformationInputs,
  transformations,
} from "@oaknational/resource-adapter-db";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import type { StoredAdaptationHead } from "./heads";
import {
  moderationColumns,
  parseStoredDocumentRow,
  isPrimarySourceOf,
  PRIMARY_SOURCE,
  type ParsedStoredDocument,
  type StoredAttempt,
  type StoredSuggestion,
  type StoredTransformation,
  type WithheldModeration,
} from "./shared";

export type AcceptedSuggestion = Readonly<{
  adaptation: typeof adaptations.$inferSelect;
  attempt: StoredAttempt;
  sourceDocument: ParsedStoredDocument;
  suggestion: StoredSuggestion;
  transformation: StoredTransformation;
}>;

/** Returns the immutable primary document shared by every retry of a request. */
export async function getPrimaryTransformationInput(
  transformationId: string,
): Promise<ParsedStoredDocument | null> {
  const [row] = await getDatabaseClient()
    .select({ storedDocument: resourceDocuments })
    .from(transformationInputs)
    .innerJoin(
      resourceDocuments,
      eq(resourceDocuments.id, transformationInputs.resourceDocumentId),
    )
    .where(isPrimarySourceOf(transformationId))
    .limit(1);

  return row === undefined ? null : parseStoredDocumentRow(row.storedDocument);
}

export async function isAcceptedContribution(
  adaptationId: string,
  contributionId: string,
): Promise<boolean> {
  const [row] = await getDatabaseClient()
    .select({ id: transformations.id })
    .from(transformations)
    .innerJoin(
      transformationAttempts,
      eq(transformationAttempts.transformationId, transformations.id),
    )
    .where(
      and(
        eq(transformations.id, contributionId),
        eq(transformations.adaptationId, adaptationId),
        isNotNull(transformationAttempts.acceptedAt),
      ),
    )
    .limit(1);

  return row !== undefined;
}

/** Creates the next numbered attempt; a redelivered job resolves its existing row. */
export async function createRetryAttempt(input: {
  jobId: string;
  transformationId: string;
}): Promise<StoredAttempt> {
  return getDatabaseClient().transaction(async (transaction) => {
    const [existing] = await transaction
      .select()
      .from(transformationAttempts)
      .where(eq(transformationAttempts.jobId, input.jobId))
      .limit(1);
    if (existing !== undefined) {
      return existing;
    }

    const [latest] = await transaction
      .select({ attemptNumber: transformationAttempts.attemptNumber })
      .from(transformationAttempts)
      .where(eq(transformationAttempts.transformationId, input.transformationId))
      .orderBy(desc(transformationAttempts.attemptNumber))
      .limit(1);
    const [attempt] = await transaction
      .insert(transformationAttempts)
      .values({
        attemptNumber: (latest?.attemptNumber ?? 0) + 1,
        jobId: input.jobId,
        transformationId: input.transformationId,
      })
      .returning();
    if (attempt === undefined) {
      throw new Error("The retry attempt was not created.");
    }
    return attempt;
  });
}

/**
 * What a teacher has already asked for and still has on this worksheet. Undoing or
 * removing a scaffold takes its contribution out of the document, which frees its
 * kind to be offered again.
 */
export async function listAppliedTransformations(
  adaptationId: string,
  contributionIds: readonly string[],
): Promise<readonly Pick<StoredTransformation, "kind" | "params" | "targetBlockId">[]> {
  if (contributionIds.length === 0) {
    return [];
  }
  return getDatabaseClient()
    .select({
      kind: transformations.kind,
      params: transformations.params,
      targetBlockId: transformations.targetBlockId,
    })
    .from(transformations)
    .where(
      and(
        eq(transformations.adaptationId, adaptationId),
        inArray(transformations.id, [...contributionIds]),
      ),
    )
    .orderBy(transformations.createdAt);
}

export async function getAttemptForJob(jobId: string): Promise<StoredAttempt | null> {
  const [row] = await getDatabaseClient()
    .select()
    .from(transformationAttempts)
    .where(eq(transformationAttempts.jobId, jobId))
    .limit(1);
  return row ?? null;
}

export type AttemptWithTransformation = Readonly<{
  attempt: StoredAttempt;
  transformation: StoredTransformation;
}>;

/** An attempt of this adaptation, found by its own ID or by the job that ran it. */
export async function getAdaptationAttempt(
  adaptationId: string,
  key: Readonly<{ attemptId: string } | { jobId: string }>,
): Promise<AttemptWithTransformation | null> {
  const [row] = await getDatabaseClient()
    .select({ attempt: transformationAttempts, transformation: transformations })
    .from(transformationAttempts)
    .innerJoin(
      transformations,
      eq(transformations.id, transformationAttempts.transformationId),
    )
    .where(
      and(
        eq(transformations.adaptationId, adaptationId),
        "attemptId" in key
          ? eq(transformationAttempts.id, key.attemptId)
          : eq(transformationAttempts.jobId, key.jobId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Finishes an attempt whose content moderation withheld. The head is left
 * where it was, so the content never reaches the worksheet or an export.
 */
export async function completeWithheldAttempt(input: {
  attemptId: string;
  moderation: WithheldModeration;
}): Promise<void> {
  await getDatabaseClient()
    .update(transformationAttempts)
    .set({ completedAt: new Date(), ...moderationColumns(input.moderation) })
    .where(
      and(
        eq(transformationAttempts.id, input.attemptId),
        isNull(transformationAttempts.completedAt),
      ),
    );
}

/** Records one internal operation and its single attempt against a document. */
export async function createOperationAttempt(input: {
  adaptationId: string;
  idempotencyKey: string;
  jobId: string;
  kind: string;
  resourceDocumentId: string;
  targetBlockId?: string | null;
}): Promise<StoredAttempt> {
  return getDatabaseClient().transaction(async (transaction) => {
    const [operation] = await transaction
      .insert(transformations)
      .values({
        adaptationId: input.adaptationId,
        idempotencyKey: input.idempotencyKey,
        kind: input.kind,
        targetBlockId: input.targetBlockId ?? null,
      })
      .returning();
    if (operation === undefined) {
      throw new Error(`The ${input.kind} operation was not created.`);
    }
    const [attempt] = await transaction
      .insert(transformationAttempts)
      .values({ attemptNumber: 1, jobId: input.jobId, transformationId: operation.id })
      .returning();
    if (attempt === undefined) {
      throw new Error(`The ${input.kind} attempt was not created.`);
    }
    await transaction.insert(transformationInputs).values({
      inputRole: PRIMARY_SOURCE,
      position: 0,
      resourceDocumentId: input.resourceDocumentId,
      transformationId: operation.id,
    });
    return attempt;
  });
}

/**
 * Whether an attempt has already finished. A run that produced nothing is
 * indistinguishable from one that never happened without this, so a redelivered
 * step would invoke the model again.
 */
export async function isAttemptComplete(attemptId: string): Promise<boolean> {
  const [row] = await getDatabaseClient()
    .select({ completedAt: transformationAttempts.completedAt })
    .from(transformationAttempts)
    .where(
      and(
        eq(transformationAttempts.id, attemptId),
        isNotNull(transformationAttempts.completedAt),
      ),
    )
    .limit(1);
  return row !== undefined;
}

export async function getAcceptedSuggestion(
  jobId: string,
  suggestionId: string,
): Promise<AcceptedSuggestion | null> {
  const [row] = await getDatabaseClient()
    .select({
      adaptation: adaptations,
      attempt: transformationAttempts,
      sourceDocument: resourceDocuments,
      suggestion: suggestedTransformations,
      transformation: transformations,
    })
    .from(transformationAttempts)
    .innerJoin(
      transformations,
      eq(transformations.id, transformationAttempts.transformationId),
    )
    .innerJoin(adaptations, eq(adaptations.id, transformations.adaptationId))
    .innerJoin(transformationInputs, isPrimarySourceOf(transformations.id))
    .innerJoin(
      resourceDocuments,
      eq(resourceDocuments.id, transformationInputs.resourceDocumentId),
    )
    .innerJoin(
      suggestedTransformations,
      and(
        eq(suggestedTransformations.id, suggestionId),
        eq(suggestedTransformations.acceptedTransformationId, transformations.id),
      ),
    )
    .where(eq(transformationAttempts.jobId, jobId))
    .limit(1);

  return row === undefined
    ? null
    : { ...row, sourceDocument: parseStoredDocumentRow(row.sourceDocument) };
}

/**
 * Claims the offer and records the work in one transaction. The update matches
 * only an unaccepted row, so a concurrent acceptance loses rather than forking
 * the adaptation.
 */
export async function acceptSuggestion(input: {
  adaptationId: string;
  head: StoredAdaptationHead;
  idempotencyKey: string;
  jobId: string;
  params: Readonly<Record<string, unknown>>;
  suggestion: StoredSuggestion;
}): Promise<AcceptedSuggestion> {
  return getDatabaseClient().transaction(async (transaction) => {
    const [transformation] = await transaction
      .insert(transformations)
      .values({
        adaptationId: input.adaptationId,
        idempotencyKey: input.idempotencyKey,
        kind: input.suggestion.kind,
        params: input.params,
        targetBlockId: input.suggestion.targetBlockId,
      })
      .returning();
    if (transformation === undefined) {
      throw new Error("The accepted transformation was not created.");
    }
    const [attempt] = await transaction
      .insert(transformationAttempts)
      .values({
        attemptNumber: 1,
        jobId: input.jobId,
        transformationId: transformation.id,
      })
      .returning();
    if (attempt === undefined) {
      throw new Error("The transformation attempt was not created.");
    }
    await transaction.insert(transformationInputs).values({
      inputRole: PRIMARY_SOURCE,
      position: 0,
      resourceDocumentId: input.head.storedDocument.id,
      transformationId: transformation.id,
    });
    const [accepted] = await transaction
      .update(suggestedTransformations)
      .set({ acceptedTransformationId: transformation.id })
      .where(
        and(
          eq(suggestedTransformations.id, input.suggestion.id),
          isNull(suggestedTransformations.acceptedTransformationId),
        ),
      )
      .returning({ id: suggestedTransformations.id });
    if (accepted === undefined) {
      throw new Error("The suggestion was accepted by another request.");
    }

    return {
      adaptation: input.head.adaptation,
      attempt,
      sourceDocument: input.head.storedDocument,
      suggestion: {
        ...input.suggestion,
        acceptedTransformationId: transformation.id,
      },
      transformation,
    };
  });
}
