import { getDatabaseClient, jobs } from "@oaknational/resource-adapter-db";
import { and, desc, eq, gt, sql } from "drizzle-orm";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * When the teacher's model jobs from the last 24 hours next fall below `limit`,
 * or null while they are under it. The window uses the database clock, which
 * also sets `created_at`.
 */
export async function modelJobLimitRetryAt(
  teacherId: string,
  limit: number,
): Promise<Date | null> {
  const database = getDatabaseClient();
  const inWindow = and(
    eq(jobs.countsAgainstClerkUserId, teacherId),
    gt(jobs.createdAt, sql`now() - interval '24 hours'`),
  );
  // The limit-th newest job must expire before another fits, including after overshoot.
  const [freedBy] = await database
    .select({ createdAt: jobs.createdAt })
    .from(jobs)
    .where(inWindow)
    .orderBy(desc(jobs.createdAt))
    .offset(limit - 1)
    .limit(1);
  return freedBy === undefined ? null : new Date(freedBy.createdAt.getTime() + DAY_MS);
}
