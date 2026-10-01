import {
  adaptations,
  getDatabaseClient,
  jobs,
  resourceDocuments,
  ResourceDocumentOrigin,
  transformationAttempts,
  transformations,
  type DatabaseClient,
} from "@oaknational/resource-adapter-db";
import { documentChangingJobKinds } from "@oaknational/resource-adapter-contracts/internal";
import type { LessonContext } from "@oaknational/resource-adapter-contracts";
import { and, desc, eq, exists, gte, inArray, isNull, sql } from "drizzle-orm";

import {
  contributionIdsInDocument,
  type ResourceDocument,
} from "@oaknational/resource-document";
import { safeParseResourceDocument } from "@oaknational/resource-document/parse";
import { raLogger } from "@oaknational/resource-adapter-logger";

import {
  markAttemptComplete,
  type ParsedStoredDocument,
  parseStoredDocumentRow,
  pendingAttemptOwnsHead,
  type Transaction,
} from "./shared";

const log = raLogger("internal-api");

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

export type StoredAdaptationHead = Readonly<{
  completedAt: Date | null;
  acceptedAt: Date | null;
  producingAdaptationId: string | null;
  busy: boolean;
  adaptation: typeof adaptations.$inferSelect;
  storedDocument: ParsedStoredDocument;
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
  const database = getDatabaseClient();
  // One statement gives ownership, head, review and pending work the same MVCC snapshot.
  const [row] = await database
    .select({
      adaptation: adaptations,
      storedDocument: resourceDocuments,
      completedAt: transformationAttempts.completedAt,
      acceptedAt: transformationAttempts.acceptedAt,
      producingAdaptationId: transformations.adaptationId,
      busy: exists(
        database
          .select({ id: jobs.id })
          .from(jobs)
          .where(
            and(
              inArray(jobs.kind, documentChangingJobKinds),
              inArray(jobs.status, ["queued", "running"]),
              sql`${jobs.input}->>'adaptationId' = ${adaptations.id}::text`,
            ),
          ),
      ).mapWith(Boolean),
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
    .leftJoin(
      transformations,
      eq(transformations.id, transformationAttempts.transformationId),
    )
    .where(and(...predicates))
    .limit(1);

  return row === undefined
    ? null
    : { ...row, storedDocument: parseStoredDocumentRow(row.storedDocument) };
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
  const read = safeParseResourceDocument(row.document);
  if (!read.success) {
    // Throwing here would stop the teacher opening the lesson at all.
    log.error(
      new Error(`Adaptation ${row.id} cannot be resumed.`, { cause: read.error }),
      { report: true },
    );
    return null;
  }
  const scaffoldCount = contributionIdsInDocument(read.data).length;
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
