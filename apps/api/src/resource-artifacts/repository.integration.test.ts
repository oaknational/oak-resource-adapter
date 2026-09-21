import { randomUUID } from "node:crypto";
import {
  adaptations,
  getDatabaseClient,
  jobs,
  resourceArtifacts,
  resourceDocuments,
  transformationAttempts,
  transformations,
} from "@oaknational/resource-adapter-db";
import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { findOwnedArtifact } from "./repository";

const withDatabase =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === "1" ? describe : describe.skip;
withDatabase("artifact ownership", () => {
  const adaptationIds: string[] = [];
  const jobIds: string[] = [];
  const documentIds: string[] = [];
  const db = getDatabaseClient;
  afterEach(async () => {
    if (adaptationIds.length)
      await db()
        .delete(adaptations)
        .where(inArray(adaptations.id, adaptationIds.splice(0)));
    if (jobIds.length)
      await db()
        .delete(jobs)
        .where(inArray(jobs.id, jobIds.splice(0)));
    if (documentIds.length)
      await db()
        .delete(resourceDocuments)
        .where(inArray(resourceDocuments.id, documentIds.splice(0)));
  });
  async function fixture(
    origin: "generated" | "oak_resource" = "generated",
    title?: unknown,
  ) {
    const teacherId = `test-${randomUUID()}`;
    const [adaptation] = await db()
      .insert(adaptations)
      .values({ capabilityId: "test", clerkUserId: teacherId })
      .returning();
    adaptationIds.push(adaptation!.id);
    const [job] = await db()
      .insert(jobs)
      .values({ kind: "test", input: {}, idempotencyKey: randomUUID() })
      .returning();
    jobIds.push(job!.id);
    const [transformation] = await db()
      .insert(transformations)
      .values({
        adaptationId: adaptation!.id,
        kind: "test",
        idempotencyKey: randomUUID(),
      })
      .returning();
    const [attempt] = await db()
      .insert(transformationAttempts)
      .values({
        transformationId: transformation!.id,
        jobId: job!.id,
        attemptNumber: 1,
      })
      .returning();
    const [document] = await db()
      .insert(resourceDocuments)
      .values({
        origin,
        document: { metadata: { title } },
        ...(origin === "generated"
          ? { transformationAttemptId: attempt!.id, position: 0 }
          : {}),
      })
      .returning();
    documentIds.push(document!.id);
    const [artifact] = await db()
      .insert(resourceArtifacts)
      .values({
        resourceDocumentId: document!.id,
        storageKey: `local/${randomUUID()}`,
        mimeType: "application/pdf",
        format: "pdf",
        byteSize: 123,
      })
      .returning();
    return { teacherId, adaptation: adaptation!, artifact: artifact! };
  }
  it("finds only the owner's generated artifact, independent of head/review state", async () => {
    const { teacherId, adaptation, artifact } = await fixture();
    expect((await findOwnedArtifact(artifact.id, teacherId))?.artifact).toEqual(
      artifact,
    );
    expect(await findOwnedArtifact(artifact.id, `other-${teacherId}`)).toBeNull();
    await db()
      .update(adaptations)
      .set({ abandonedAt: new Date() })
      .where(eq(adaptations.id, adaptation.id));
    expect((await findOwnedArtifact(artifact.id, teacherId))?.artifact.id).toBe(
      artifact.id,
    );
  });
  it.each([
    ["Exploring linear equations", "Exploring linear equations"],
    [undefined, null],
    [{ nested: "not a string" }, null],
  ])("reads the stored title %j as %j", async (title, expected) => {
    const { teacherId, artifact } = await fixture("generated", title);
    expect((await findOwnedArtifact(artifact.id, teacherId))?.title).toBe(expected);
  });

  it("does not serve original Oak documents", async () => {
    const { teacherId, artifact } = await fixture("oak_resource");
    expect(await findOwnedArtifact(artifact.id, teacherId)).toBeNull();
  });
  it("does not reveal missing IDs", async () => {
    expect(await findOwnedArtifact(randomUUID(), "teacher")).toBeNull();
  });
});
