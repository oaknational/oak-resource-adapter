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
import { and, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import type { ResourceDocument } from "@oaknational/resource-document";

const PRIMARY_SOURCE = "primary_source";

type Transaction = Parameters<
  Parameters<ReturnType<typeof getDatabaseClient>["transaction"]>[0]
>[0];

function markAttemptComplete(transaction: Transaction, attemptId: string) {
  return transaction
    .update(transformationAttempts)
    .set({ completedAt: new Date() })
    .where(eq(transformationAttempts.id, attemptId));
}

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
  /** Internal operations share this table and are not scaffolds a teacher chose. */
  operationKind: string;
  teacherId: string;
}): Promise<ResumableAdaptation | null> {
  const [row] = await getDatabaseClient()
    .select({
      id: adaptations.id,
      // Shown to the teacher as work they did, so only settled work counts.
      scaffoldCount: sql<number>`(
        select count(distinct ${transformations.id})::int
        from ${transformations}
        inner join ${transformationAttempts}
          on ${transformationAttempts.transformationId} = ${transformations.id}
        inner join ${jobs}
          on ${jobs.id} = ${transformationAttempts.jobId}
          and ${jobs.status} = ${JobStatus.SUCCEEDED}
        where ${transformations.adaptationId} = ${adaptations.id}
          and ${transformations.kind} <> ${input.operationKind}
      )`,
      updatedAt: adaptations.updatedAt,
    })
    .from(adaptations)
    .innerJoin(
      resourceDocuments,
      eq(resourceDocuments.id, adaptations.headResourceDocumentId),
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

  return row ?? null;
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
  teacherId: string;
}): Promise<{ adaptationId: string; resourceDocumentId: string }> {
  return getDatabaseClient().transaction(async (transaction) => {
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
      throw new Error("The worksheet scaffolding adaptation could not be replaced.");
    }

    return insertAdaptationWithSourceDocument(transaction, input);
  });
}

/**
 * What a teacher has already asked for on this worksheet, including work still
 * running. Excluding in-flight work would make the answer depend on when it was
 * asked, so the same scaffold could be offered twice. Only a failed attempt
 * frees its kind to be offered again.
 */
export async function listAppliedTransformations(
  adaptationId: string,
): Promise<readonly Pick<StoredTransformation, "kind" | "params" | "targetBlockId">[]> {
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
        sql`exists (
          select 1
          from ${transformationAttempts}
          inner join ${jobs} on ${jobs.id} = ${transformationAttempts.jobId}
          where ${transformationAttempts.transformationId} = ${transformations.id}
            and ${jobs.status} <> ${JobStatus.FAILED}
        )`,
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

export async function createOperationAttempt(input: {
  adaptationId: string;
  idempotencyKey: string;
  jobId: string;
  kind: string;
  resourceDocumentId: string;
}): Promise<StoredAttempt> {
  return getDatabaseClient().transaction(async (transaction) => {
    const [operation] = await transaction
      .insert(transformations)
      .values({
        adaptationId: input.adaptationId,
        idempotencyKey: input.idempotencyKey,
        kind: input.kind,
      })
      .returning();
    if (operation === undefined) {
      throw new Error("The suggestion operation was not created.");
    }
    const [attempt] = await transaction
      .insert(transformationAttempts)
      .values({ attemptNumber: 1, jobId: input.jobId, transformationId: operation.id })
      .returning();
    if (attempt === undefined) {
      throw new Error("The suggestion attempt was not created.");
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
  outputs: readonly GeneratedOutput[];
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
    const [advanced] = await transaction
      .update(adaptations)
      .set({ headResourceDocumentId: nextHead.id })
      .where(
        and(
          eq(adaptations.id, input.adaptationId),
          eq(adaptations.headResourceDocumentId, input.expectedHeadId),
        ),
      )
      .returning({ id: adaptations.id });
    if (advanced === undefined) {
      throw new Error("The adaptation head changed before the scaffold was applied.");
    }
    await markAttemptComplete(transaction, input.attemptId);
    return nextHead.id;
  });
}
