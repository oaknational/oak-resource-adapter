import type { LessonContext } from "@oaknational/resource-adapter-contracts";
import {
  adaptations,
  getDatabaseClient,
  resourceDocuments,
  ResourceDocumentOrigin,
  transformationAttempts,
} from "@oaknational/resource-adapter-db";
import { raLogger } from "@oaknational/resource-adapter-logger";
import { contributionIdsInDocument } from "@oaknational/resource-document";
import { safeParseResourceDocument } from "@oaknational/resource-document/parse";
import { and, desc, eq, gte, isNull } from "drizzle-orm";

const log = raLogger("internal-api");

export type ResumableAdaptation = Readonly<{
  id: string;
  pendingScaffoldCount: number;
  scaffoldCount: number;
  updatedAt: Date;
}>;

type RecentAdaptationsQuery = Readonly<{
  capabilityId: string;
  lesson: LessonContext;
  notBefore: Date;
  teacherId: string;
}>;

function recentAdaptationsOfLesson(input: RecentAdaptationsQuery) {
  return [
    eq(adaptations.clerkUserId, input.teacherId),
    eq(adaptations.capabilityId, input.capabilityId),
    eq(adaptations.lessonSlug, input.lesson.lessonSlug),
    eq(adaptations.programmeSlug, input.lesson.programmeSlug),
    isNull(adaptations.abandonedAt),
    gte(adaptations.updatedAt, input.notBefore),
  ];
}

/**
 * Work a teacher can be offered back: their most recent adaptation of this
 * lesson with at least one scaffold still in its head.
 */
export async function findResumableAdaptation(
  input: RecentAdaptationsQuery,
): Promise<ResumableAdaptation | null> {
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
        ...recentAdaptationsOfLesson(input),
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

/**
 * The teacher's most recent adaptation of this lesson with no scaffolds in its
 * head, including work whose scaffolds were all removed.
 */
export async function findReopenableAdaptation(
  input: RecentAdaptationsQuery,
): Promise<{ id: string } | null> {
  const [row] = await getDatabaseClient()
    .select({ document: resourceDocuments.document, id: adaptations.id })
    .from(adaptations)
    .innerJoin(
      resourceDocuments,
      eq(resourceDocuments.id, adaptations.headResourceDocumentId),
    )
    .where(and(...recentAdaptationsOfLesson(input)))
    .orderBy(desc(adaptations.updatedAt))
    .limit(1);

  if (row === undefined) {
    return null;
  }
  const read = safeParseResourceDocument(row.document);
  return read.success && contributionIdsInDocument(read.data).length === 0
    ? { id: row.id }
    : null;
}
