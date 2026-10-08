import { randomUUID } from "node:crypto";

import { getDatabaseClient, jobs } from "@oaknational/resource-adapter-db";
import { inArray, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { modelJobLimitRetryAt } from "./repository";

const describeWithDatabase =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" ? describe : describe.skip;

const DAY_MS = 24 * 60 * 60 * 1000;

async function countedJobs(teacherId: string, hoursAgo: readonly number[]) {
  return getDatabaseClient()
    .insert(jobs)
    .values(
      hoursAgo.map((hours) => ({
        countsAgainstClerkUserId: teacherId,
        createdAt: sql`now() - ${hours}::float8 * interval '1 hour'`,
        idempotencyKey: `integration-${randomUUID()}`,
        input: { message: "counted" },
        kind: "test.echo",
      })),
    )
    .returning({ createdAt: jobs.createdAt });
}

describeWithDatabase("rolling model-job allowance", () => {
  const teacherIds: string[] = [];

  afterEach(async () => {
    const ids = teacherIds.splice(0);
    if (ids.length > 0) {
      await getDatabaseClient()
        .delete(jobs)
        .where(inArray(jobs.countsAgainstClerkUserId, ids));
    }
  });

  function newTeacher(): string {
    const teacherId = `user_test_${randomUUID().replaceAll("-", "")}`;
    teacherIds.push(teacherId);
    return teacherId;
  }

  it("allows a teacher under the limit", async () => {
    const teacherId = newTeacher();
    await countedJobs(teacherId, [3, 2]);

    await expect(modelJobLimitRetryAt(teacherId, 3)).resolves.toBeNull();
  });

  it("allows a teacher with no counted jobs", async () => {
    await expect(modelJobLimitRetryAt(newTeacher(), 1)).resolves.toBeNull();
  });

  it("allows a retry at the limit when the oldest job leaves the window", async () => {
    const teacherId = newTeacher();
    const [oldest] = await countedJobs(teacherId, [5, 3, 1]);

    await expect(modelJobLimitRetryAt(teacherId, 3)).resolves.toEqual(
      new Date((oldest?.createdAt.getTime() ?? 0) + DAY_MS),
    );
  });

  it("allows a retry over the limit only once enough jobs leave the window", async () => {
    const teacherId = newTeacher();
    const inserted = await countedJobs(teacherId, [5, 4, 3, 2, 1]);

    await expect(modelJobLimitRetryAt(teacherId, 2)).resolves.toEqual(
      new Date((inserted[3]?.createdAt.getTime() ?? 0) + DAY_MS),
    );
  });

  it("waits for the newest job when the limit is one", async () => {
    const teacherId = newTeacher();
    const inserted = await countedJobs(teacherId, [5, 1]);

    await expect(modelJobLimitRetryAt(teacherId, 1)).resolves.toEqual(
      new Date((inserted[1]?.createdAt.getTime() ?? 0) + DAY_MS),
    );
  });

  it("allows work once a counted job is 24 hours old", async () => {
    const teacherId = newTeacher();
    // `created_at` rounds to the millisecond, so exactly 24 hours can still fall
    // inside the window by the time the check reads `now()`.
    await countedJobs(teacherId, [24 + 1 / 3600]);

    await expect(modelJobLimitRetryAt(teacherId, 1)).resolves.toBeNull();
  });

  it("counts neither older jobs nor another teacher's", async () => {
    const teacherId = newTeacher();
    await countedJobs(teacherId, [30, 25, 1]);
    await countedJobs(newTeacher(), [3, 2, 1]);

    await expect(modelJobLimitRetryAt(teacherId, 2)).resolves.toBeNull();
  });
});
