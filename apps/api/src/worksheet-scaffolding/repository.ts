import {
  adaptations,
  getDatabaseClient,
  JobStatus,
  jobs,
  resourceDocuments,
  ResourceDocumentOrigin,
  suggestedTransformations,
  transformationAttempts,
  transformationInputs,
  transformations,
  type DatabaseClient,
  type Job,
} from "@oaknational/resource-adapter-db";
import type { LessonContext } from "@oaknational/resource-adapter-contracts";
import {
  and,
  desc,
  eq,
  exists,
  gte,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";

import {
  contributionIdsInDocument,
  type ResourceDocument,
} from "@oaknational/resource-document";
import { parseResourceDocument } from "@oaknational/resource-document/parse";

const PRIMARY_SOURCE = "primary_source";

type Transaction = Parameters<
  Parameters<ReturnType<typeof getDatabaseClient>["transaction"]>[0]
>[0];

function markAttemptComplete(
  transaction: Transaction,
  attemptId: string,
  review: "accepted" | "pending" = "pending",
) {
  const completedAt = new Date();
  return transaction
    .update(transformationAttempts)
    .set({ completedAt, ...(review === "pending" ? {} : { acceptedAt: completedAt }) })
    .where(eq(transformationAttempts.id, attemptId));
}

/**
 * The head document, only while one completed but unaccepted attempt of this
 * adaptation still owns it. Used as an `exists` guard so a stale request cannot
 * accept, undo or overwrite a review that has already moved on.
 */
function pendingAttemptOwnsHead(
  transaction: Transaction,
  input: { adaptationId: string; attemptId: string; resourceDocumentId: string },
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
    .where(
      and(
        eq(resourceDocuments.id, input.resourceDocumentId),
        eq(transformationAttempts.id, input.attemptId),
        eq(transformations.adaptationId, input.adaptationId),
        isNull(transformationAttempts.acceptedAt),
        isNotNull(transformationAttempts.completedAt),
      ),
    );
}

/** As above, but keyed on the transformation and the input it must return to. */
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

/** Guards against an attempt from a different adaptation advancing this head. */
function attemptBelongsToAdaptation(
  transaction: Transaction,
  input: { adaptationId: string; attemptId: string },
) {
  return transaction
    .select({ id: transformationAttempts.id })
    .from(transformationAttempts)
    .innerJoin(
      transformations,
      eq(transformations.id, transformationAttempts.transformationId),
    )
    .where(
      and(
        eq(transformationAttempts.id, input.attemptId),
        eq(transformations.adaptationId, input.adaptationId),
      ),
    );
}

class PendingReviewConflictError extends Error {}

/** Stored parameters are jsonb, so their shape is only known once read. */
export function asParams(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Stored transformation parameters are not an object.");
  }
  return value as Readonly<Record<string, unknown>>;
}

export type StoredAdaptationHead = Readonly<{
  adaptation: typeof adaptations.$inferSelect;
  storedDocument: typeof resourceDocuments.$inferSelect;
}>;

export type StoredSuggestion = typeof suggestedTransformations.$inferSelect;
export type StoredAttempt = typeof transformationAttempts.$inferSelect;
export type StoredTransformation = typeof transformations.$inferSelect;

export type PendingReview = Readonly<{
  attempt: StoredAttempt;
  suggestion: StoredSuggestion;
  transformation: StoredTransformation;
}>;

export type AcceptedSuggestion = Readonly<{
  adaptation: typeof adaptations.$inferSelect;
  attempt: StoredAttempt;
  sourceDocument: typeof resourceDocuments.$inferSelect;
  suggestion: StoredSuggestion;
  transformation: StoredTransformation;
}>;

export type GeneratedOutput = Readonly<{
  document: ResourceDocument;
  purpose: string;
}>;

export async function getAdaptationHead(
  adaptationId: string,
  teacherId?: string,
): Promise<StoredAdaptationHead | null> {
  const predicates = [eq(adaptations.id, adaptationId)];
  if (teacherId !== undefined) {
    predicates.push(eq(adaptations.clerkUserId, teacherId));
  }
  const [row] = await getDatabaseClient()
    .select({ adaptation: adaptations, storedDocument: resourceDocuments })
    .from(adaptations)
    .innerJoin(
      resourceDocuments,
      eq(resourceDocuments.id, adaptations.headResourceDocumentId),
    )
    .where(and(...predicates))
    .limit(1);

  return row ?? null;
}

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

/** Returns the immutable primary document shared by every retry of a request. */
export async function getPrimaryTransformationInput(
  transformationId: string,
): Promise<typeof resourceDocuments.$inferSelect | null> {
  const [row] = await getDatabaseClient()
    .select({ storedDocument: resourceDocuments })
    .from(transformationInputs)
    .innerJoin(
      resourceDocuments,
      eq(resourceDocuments.id, transformationInputs.resourceDocumentId),
    )
    .where(
      and(
        eq(transformationInputs.transformationId, transformationId),
        eq(transformationInputs.inputRole, PRIMARY_SOURCE),
        eq(transformationInputs.position, 0),
      ),
    )
    .limit(1);

  return row?.storedDocument ?? null;
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

/** Prefers work still in flight, so a stale failure never masks a running job. */
export async function getLatestJobForConcurrencyKey(
  concurrencyKey: string,
  kinds: readonly string[],
): Promise<Job | null> {
  const database = getDatabaseClient();
  const matchesConcurrencyKey = and(
    inArray(jobs.kind, [...kinds]),
    eq(jobs.concurrencyKey, concurrencyKey),
  );
  const [activeJob] = await database
    .select()
    .from(jobs)
    .where(
      and(
        matchesConcurrencyKey,
        inArray(jobs.status, [JobStatus.QUEUED, JobStatus.RUNNING]),
      ),
    )
    .orderBy(desc(jobs.createdAt))
    .limit(1);
  if (activeJob !== undefined) {
    return activeJob;
  }
  const [latestJob] = await database
    .select()
    .from(jobs)
    .where(matchesConcurrencyKey)
    .orderBy(desc(jobs.createdAt))
    .limit(1);
  return latestJob ?? null;
}

export async function listOpenSuggestions(
  resourceDocumentId: string,
): Promise<readonly StoredSuggestion[]> {
  return getDatabaseClient()
    .select()
    .from(suggestedTransformations)
    .where(
      and(
        eq(suggestedTransformations.resourceDocumentId, resourceDocumentId),
        isNull(suggestedTransformations.acceptedTransformationId),
      ),
    )
    .orderBy(suggestedTransformations.position);
}

export async function getOpenSuggestion(
  suggestionId: string,
  resourceDocumentId: string,
): Promise<StoredSuggestion | null> {
  const [row] = await getDatabaseClient()
    .select()
    .from(suggestedTransformations)
    .where(
      and(
        eq(suggestedTransformations.id, suggestionId),
        eq(suggestedTransformations.resourceDocumentId, resourceDocumentId),
        isNull(suggestedTransformations.acceptedTransformationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export type ResumableAdaptation = Readonly<{
  id: string;
  pendingScaffoldCount: number;
  scaffoldCount: number;
  updatedAt: Date;
}>;

/**
 * Work a teacher can be offered back: their most recent adaptation of this
 * lesson that they have actually changed and have not abandoned. An adaptation
 * whose head is still the Oak worksheet has nothing they would recognise.
 */
export async function findResumableAdaptation(input: {
  capabilityId: string;
  lesson: LessonContext;
  notBefore: Date;
  teacherId: string;
}): Promise<ResumableAdaptation | null> {
  const [row] = await getDatabaseClient()
    .select({
      acceptedAt: transformationAttempts.acceptedAt,
      completedAt: transformationAttempts.completedAt,
      document: resourceDocuments.document,
      id: adaptations.id,
      updatedAt: adaptations.updatedAt,
    })
    .from(adaptations)
    .innerJoin(
      resourceDocuments,
      eq(resourceDocuments.id, adaptations.headResourceDocumentId),
    )
    .leftJoin(
      transformationAttempts,
      eq(transformationAttempts.id, resourceDocuments.transformationAttemptId),
    )
    .where(
      and(
        eq(adaptations.clerkUserId, input.teacherId),
        eq(adaptations.capabilityId, input.capabilityId),
        eq(adaptations.lessonSlug, input.lesson.lessonSlug),
        eq(adaptations.programmeSlug, input.lesson.programmeSlug),
        isNull(adaptations.abandonedAt),
        gte(adaptations.updatedAt, input.notBefore),
        eq(resourceDocuments.origin, ResourceDocumentOrigin.GENERATED),
      ),
    )
    .orderBy(desc(adaptations.updatedAt))
    .limit(1);

  if (row === undefined) {
    return null;
  }
  const scaffoldCount = contributionIdsInDocument(
    parseResourceDocument(row.document),
  ).length;
  return scaffoldCount === 0
    ? null
    : {
        id: row.id,
        pendingScaffoldCount:
          row.acceptedAt === null && row.completedAt !== null ? 1 : 0,
        scaffoldCount,
        updatedAt: row.updatedAt,
      };
}

export async function createAdaptationWithSourceDocument(input: {
  capabilityId: string;
  document: ResourceDocument;
  lesson: LessonContext;
  teacherId: string;
}): Promise<{ adaptationId: string; resourceDocumentId: string }> {
  return getDatabaseClient().transaction((transaction) =>
    insertAdaptationWithSourceDocument(transaction, input),
  );
}

type AdaptationWriter = Pick<DatabaseClient, "insert" | "update">;

async function insertAdaptationWithSourceDocument(
  database: AdaptationWriter,
  input: {
    capabilityId: string;
    document: ResourceDocument;
    lesson: LessonContext;
    replacementRequestId?: string;
    teacherId: string;
  },
): Promise<{ adaptationId: string; resourceDocumentId: string }> {
  const [adaptation] = await database
    .insert(adaptations)
    .values({
      capabilityId: input.capabilityId,
      clerkUserId: input.teacherId,
      lessonSlug: input.lesson.lessonSlug,
      programmeSlug: input.lesson.programmeSlug,
      replacementRequestId: input.replacementRequestId,
    })
    .returning({ id: adaptations.id });
  if (adaptation === undefined) {
    throw new Error("The worksheet scaffolding adaptation was not created.");
  }

  const [storedDocument] = await database
    .insert(resourceDocuments)
    .values({
      document: input.document,
      origin: ResourceDocumentOrigin.OAK_RESOURCE,
      retrievedAt: new Date(),
      sourceId: input.document.id,
      sourceReference: {
        lessonSlug: input.lesson.lessonSlug,
        programmeSlug: input.lesson.programmeSlug,
        resourceType: "worksheet",
        source: "oak",
      },
    })
    .returning({ id: resourceDocuments.id });
  if (storedDocument === undefined) {
    throw new Error("The source worksheet was not stored.");
  }

  await database
    .update(adaptations)
    .set({ headResourceDocumentId: storedDocument.id })
    .where(eq(adaptations.id, adaptation.id));

  return { adaptationId: adaptation.id, resourceDocumentId: storedDocument.id };
}

/** Abandons declined work and creates its replacement as one indivisible change. */
export async function replaceAdaptationWithSourceDocument(input: {
  capabilityId: string;
  document: ResourceDocument;
  lesson: LessonContext;
  replacingAdaptationId: string;
  replacementRequestId: string;
  teacherId: string;
}): Promise<{ adaptationId: string; resourceDocumentId: string }> {
  return getDatabaseClient().transaction(async (transaction) => {
    const findReplacement = async () => {
      const [replacement] = await transaction
        .select({
          adaptationId: adaptations.id,
          resourceDocumentId: adaptations.headResourceDocumentId,
        })
        .from(adaptations)
        .where(
          and(
            eq(adaptations.replacementRequestId, input.replacementRequestId),
            eq(adaptations.clerkUserId, input.teacherId),
            eq(adaptations.capabilityId, input.capabilityId),
            eq(adaptations.lessonSlug, input.lesson.lessonSlug),
            eq(adaptations.programmeSlug, input.lesson.programmeSlug),
          ),
        )
        .limit(1);
      if (replacement === undefined) {
        return null;
      }
      const { adaptationId, resourceDocumentId } = replacement;
      return resourceDocumentId === null ? null : { adaptationId, resourceDocumentId };
    };

    const replay = await findReplacement();
    if (replay !== null) {
      return replay;
    }

    const [abandoned] = await transaction
      .update(adaptations)
      .set({ abandonedAt: new Date() })
      .where(
        and(
          eq(adaptations.id, input.replacingAdaptationId),
          eq(adaptations.clerkUserId, input.teacherId),
          eq(adaptations.capabilityId, input.capabilityId),
          eq(adaptations.lessonSlug, input.lesson.lessonSlug),
          eq(adaptations.programmeSlug, input.lesson.programmeSlug),
          isNull(adaptations.abandonedAt),
        ),
      )
      .returning({ id: adaptations.id });
    if (abandoned === undefined) {
      const concurrentReplay = await findReplacement();
      if (concurrentReplay !== null) {
        return concurrentReplay;
      }
      throw new Error("The worksheet scaffolding adaptation could not be replaced.");
    }

    return insertAdaptationWithSourceDocument(transaction, {
      ...input,
      replacementRequestId: input.replacementRequestId,
    });
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
    .innerJoin(
      transformationInputs,
      and(
        eq(transformationInputs.transformationId, transformations.id),
        eq(transformationInputs.inputRole, PRIMARY_SOURCE),
        eq(transformationInputs.position, 0),
      ),
    )
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

  return row ?? null;
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

/**
 * Advances the head only while it still points at the document the run consumed,
 * so a concurrent application fails rather than dropping the other's work.
 */
export async function storeOutputsAndAdvanceHead(input: {
  adaptationId: string;
  attemptId: string;
  expectedHeadId: string;
  /** Retry additionally requires this attempt to remain pending on the expected head. */
  expectedPendingAttemptId?: string;
  outputs: readonly GeneratedOutput[];
  /** An operation the teacher already asked for needs no separate approval. */
  review?: "accepted" | "pending";
  revisedPosition: number;
}): Promise<string> {
  return getDatabaseClient().transaction(async (transaction) => {
    const inserted = await transaction
      .insert(resourceDocuments)
      .values(
        input.outputs.map(({ document, purpose }, position) => ({
          document,
          origin: ResourceDocumentOrigin.GENERATED,
          position,
          sourceReference: { purpose },
          transformationAttemptId: input.attemptId,
        })),
      )
      .returning({ id: resourceDocuments.id, position: resourceDocuments.position });
    const nextHead = inserted.find(
      ({ position }) => position === input.revisedPosition,
    );
    if (nextHead === undefined) {
      throw new Error("The transformation did not produce a revised resource.");
    }
    const expectedPendingAttempt =
      input.expectedPendingAttemptId === undefined
        ? undefined
        : pendingAttemptOwnsHead(transaction, {
            adaptationId: input.adaptationId,
            attemptId: input.expectedPendingAttemptId,
            resourceDocumentId: input.expectedHeadId,
          });
    const [advanced] = await transaction
      .update(adaptations)
      .set({ headResourceDocumentId: nextHead.id })
      .where(
        and(
          eq(adaptations.id, input.adaptationId),
          eq(adaptations.headResourceDocumentId, input.expectedHeadId),
          exists(
            attemptBelongsToAdaptation(transaction, {
              adaptationId: input.adaptationId,
              attemptId: input.attemptId,
            }),
          ),
          ...(expectedPendingAttempt === undefined
            ? []
            : [exists(expectedPendingAttempt)]),
        ),
      )
      .returning({ id: adaptations.id });
    if (advanced === undefined) {
      throw new Error("The adaptation head changed before the scaffold was applied.");
    }
    await markAttemptComplete(transaction, input.attemptId, input.review);
    return nextHead.id;
  });
}
