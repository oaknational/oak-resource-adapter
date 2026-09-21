import { randomUUID } from "node:crypto";

import { and, eq, or, sql } from "drizzle-orm";

import type { DatabaseClient } from "./client.js";
import { adaptations } from "./schema/adaptations.js";
import { jobs } from "./schema/jobs.js";
import {
  resourceArtifacts,
  type ResourceArtifact,
} from "./schema/resource-artifacts.js";
import { resourceDocuments } from "./schema/resource-documents.js";
import { transformationAttempts } from "./schema/transformation-attempts.js";
import { transformations } from "./schema/transformations.js";

export type DatabaseTransaction = Parameters<
  Parameters<DatabaseClient["transaction"]>[0]
>[0];

export const downloadFixtureTitle = "Persistent artifact download fixture";
export const downloadFixtureMimeType =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const localDownloadFixtureKey =
  "local/_persistent-fixtures/do-not-delete/artifact-download/v1/worksheet.docx";

/** Keeps the envelope of a real document; the body is replaced so no lesson content is copied. */
export function downloadFixtureDocument(base: { metadata?: unknown }) {
  const metadata = base.metadata as Record<string, unknown> | undefined;
  const envelope: Record<string, unknown> = { ...base };
  delete envelope.sourceMap;
  return {
    ...envelope,
    id: "persistent-download-fixture",
    metadata: { ...metadata, title: downloadFixtureTitle },
    content: [
      {
        id: "fixture-text",
        type: "paragraph",
        content: [{ type: "text", text: downloadFixtureTitle }],
      },
    ],
    assets: [],
    answers: [],
    diagnostics: [],
  };
}

export type DownloadFixtureInput = {
  document: unknown;
  teacherId: string;
  key: string;
  byteSize: number;
  checksum: string | null;
  artifactId?: string;
};

export async function insertDownloadFixture(
  transaction: DatabaseTransaction,
  { document, artifactId, teacherId, key, byteSize, checksum }: DownloadFixtureInput,
): Promise<ResourceArtifact> {
  const now = new Date();
  const [adaptation] = await transaction
    .insert(adaptations)
    .values({
      capabilityId: "artifact-download-fixture",
      clerkUserId: teacherId,
      abandonedAt: now,
    })
    .returning();
  const [job] = await transaction
    .insert(jobs)
    .values({
      idempotencyKey: randomUUID(),
      input: {},
      kind: "fixture.artifact-download",
      status: "succeeded",
      completedAt: now,
    })
    .returning();
  const [transformation] = await transaction
    .insert(transformations)
    .values({
      adaptationId: adaptation!.id,
      idempotencyKey: randomUUID(),
      kind: "fixture.artifact-download",
    })
    .returning();
  const [attempt] = await transaction
    .insert(transformationAttempts)
    .values({
      transformationId: transformation!.id,
      jobId: job!.id,
      attemptNumber: 1,
      completedAt: now,
      acceptedAt: now,
    })
    .returning();
  const [stored] = await transaction
    .insert(resourceDocuments)
    .values({
      document,
      origin: "generated",
      transformationAttemptId: attempt!.id,
      position: 0,
    })
    .returning();
  const [created] = await transaction
    .insert(resourceArtifacts)
    .values({
      ...(artifactId === undefined ? {} : { id: artifactId }),
      resourceDocumentId: stored!.id,
      format: "docx",
      mimeType: downloadFixtureMimeType,
      storageKey: key,
      byteSize,
      checksum,
    })
    .returning();
  return created!;
}

export async function seedDownloadFixture(
  database: DatabaseClient,
  input: DownloadFixtureInput & { artifactId: string },
): Promise<ResourceArtifact> {
  return database.transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext(${input.key}))`,
    );
    const [existing] = await transaction
      .select({ artifact: resourceArtifacts, teacher: adaptations.clerkUserId })
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
      .where(
        and(
          eq(resourceDocuments.origin, "generated"),
          or(
            eq(resourceArtifacts.id, input.artifactId),
            eq(resourceArtifacts.storageKey, input.key),
          ),
        ),
      );
    if (!existing) return insertDownloadFixture(transaction, input);
    if (
      existing.teacher !== input.teacherId ||
      existing.artifact.id !== input.artifactId ||
      existing.artifact.storageKey !== input.key ||
      existing.artifact.byteSize !== input.byteSize ||
      existing.artifact.checksum !== input.checksum ||
      existing.artifact.mimeType !== downloadFixtureMimeType ||
      existing.artifact.format !== "docx"
    ) {
      throw new Error(
        "Existing fixture does not match the configured ID, owner or stored file; refusing to replace it.",
      );
    }
    return existing.artifact;
  });
}
