import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getDatabaseClient } from "./client.js";
import {
  downloadFixtureDocument,
  seedDownloadFixture,
  type DownloadFixtureInput,
} from "./fixtures.js";
import { adaptations } from "./schema/adaptations.js";
import { jobs } from "./schema/jobs.js";
import { resourceArtifacts } from "./schema/resource-artifacts.js";
import { resourceDocuments } from "./schema/resource-documents.js";
import { transformationAttempts } from "./schema/transformation-attempts.js";
import { transformations } from "./schema/transformations.js";

const withDatabase =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" ? describe : describe.skip;
withDatabase("local fixture records", () => {
  let input: DownloadFixtureInput & { artifactId: string };
  const database = getDatabaseClient;
  beforeEach(() => {
    const id = randomUUID();
    input = {
      document: downloadFixtureDocument({ metadata: { title: "base" } }),
      artifactId: id,
      teacherId: `seed-test-${id}`,
      key: `local/seed-test-${id}`,
      byteSize: 123,
      checksum: "test-md5",
    };
  });
  async function removeTestRecords() {
    const attempts = await database()
      .select({ jobId: transformationAttempts.jobId })
      .from(transformationAttempts)
      .innerJoin(
        transformations,
        eq(transformations.id, transformationAttempts.transformationId),
      )
      .innerJoin(adaptations, eq(adaptations.id, transformations.adaptationId))
      .where(eq(adaptations.clerkUserId, input.teacherId));
    await database()
      .delete(adaptations)
      .where(eq(adaptations.clerkUserId, input.teacherId));
    if (attempts.length)
      await database()
        .delete(jobs)
        .where(
          inArray(
            jobs.id,
            attempts.map(({ jobId }) => jobId),
          ),
        );
  }
  afterEach(removeTestRecords);
  it("reuses the configured ID, is idempotent, and restores records after their deletion", async () => {
    const first = await seedDownloadFixture(database(), input);
    expect(first.id).toBe(input.artifactId);
    expect(await seedDownloadFixture(database(), input)).toEqual(first);
    const owned = await database()
      .select({ owner: adaptations.clerkUserId })
      .from(resourceArtifacts)
      .innerJoin(
        resourceDocuments,
        eq(resourceDocuments.id, resourceArtifacts.resourceDocumentId),
      )
      .innerJoin(
        transformationAttempts,
        eq(transformationAttempts.id, resourceDocuments.transformationAttemptId),
      )
      .innerJoin(
        transformations,
        eq(transformations.id, transformationAttempts.transformationId),
      )
      .innerJoin(adaptations, eq(adaptations.id, transformations.adaptationId))
      .where(eq(resourceArtifacts.id, input.artifactId));
    expect(owned).toEqual([{ owner: input.teacherId }]);
    await removeTestRecords();
    const restored = await seedDownloadFixture(database(), input);
    expect(restored.id).toBe(first.id);
    expect(restored.storageKey).toBe(first.storageKey);
    expect(restored.resourceDocumentId).not.toBe(first.resourceDocumentId);
  });
  it("serialises simultaneous seed calls", async () => {
    const [first, second] = await Promise.all([
      seedDownloadFixture(database(), input),
      seedDownloadFixture(database(), input),
    ]);
    expect(first).toEqual(second);
  });
  it.each([
    { teacherId: "another-teacher" },
    { artifactId: randomUUID() },
    { checksum: "changed" },
  ])("refuses to overwrite a conflicting fixture: %j", async (change) => {
    const first = await seedDownloadFixture(database(), input);
    await expect(
      seedDownloadFixture(database(), { ...input, ...change }),
    ).rejects.toThrow("refusing to replace");
    expect(await seedDownloadFixture(database(), input)).toEqual(first);
  });
});
