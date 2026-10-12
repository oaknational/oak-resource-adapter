import type { LessonContext } from "@oaknational/resource-adapter-contracts";
import {
  adaptations,
  type DatabaseClient,
  getDatabaseClient,
} from "@oaknational/resource-adapter-db";
import { and, eq, gte, sql } from "drizzle-orm";

type AllowanceTransaction = Pick<DatabaseClient, "execute" | "selectDistinct">;

export type AdaptationAllowance =
  "unlimited" | Readonly<{ limit: number; since: Date }>;

export type AdaptedResource = Readonly<{
  capabilityId: string;
  lessonSlug: string | null;
  programmeSlug: string | null;
}>;

/** Includes abandoned work: leaving it out would charge a teacher again for starting over. */
export async function adaptedResourcesSince(
  teacherId: string,
  since: Date,
  database: Pick<DatabaseClient, "selectDistinct"> = getDatabaseClient(),
): Promise<readonly AdaptedResource[]> {
  return database
    .selectDistinct({
      capabilityId: adaptations.capabilityId,
      lessonSlug: adaptations.lessonSlug,
      programmeSlug: adaptations.programmeSlug,
    })
    .from(adaptations)
    .where(
      and(eq(adaptations.clerkUserId, teacherId), gte(adaptations.createdAt, since)),
    );
}

/**
 * Holds the teacher's lock until the transaction ends, so concurrent requests
 * cannot both take the last use.
 */
export async function isWithinAllowance(
  transaction: AllowanceTransaction,
  input: Readonly<{ capabilityId: string; lesson: LessonContext; teacherId: string }>,
  allowance: AdaptationAllowance,
): Promise<boolean> {
  if (allowance === "unlimited") {
    return true;
  }
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`ora:adapted-resources:${input.teacherId}`}, 0))`,
  );
  const counted = await adaptedResourcesSince(
    input.teacherId,
    allowance.since,
    transaction,
  );
  const alreadyCounted = counted.some(
    (resource) =>
      resource.capabilityId === input.capabilityId &&
      resource.lessonSlug === input.lesson.lessonSlug &&
      resource.programmeSlug === input.lesson.programmeSlug,
  );
  return alreadyCounted || counted.length < allowance.limit;
}
