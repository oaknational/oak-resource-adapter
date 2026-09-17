import {
  adaptations,
  downloadFixtureDocument,
  downloadFixtureMimeType,
  downloadFixtureTitle,
  getDatabaseClient,
  insertDownloadFixture,
  jobs,
  resourceArtifacts,
  resourceDocuments,
  transformationAttempts,
  transformations,
} from "@oaknational/resource-adapter-db";
import { loadOriginalResourceDocumentFixture } from "@oaknational/resource-adapter-original-resource-documents/fixtures";
import {
  artifactKey,
  type ArtifactEnvironment,
  deleteArtifact,
  isArtifactNotFound,
  getArtifactMetadata,
  uploadArtifact,
} from "@oaknational/resource-adapter-storage";
import { Document, Packer, Paragraph } from "docx";
import { eq, sql } from "drizzle-orm";

export type FixtureEnvironment = Exclude<ArtifactEnvironment, "production">;

export function personalFixtureKey(
  teacherId: string,
  environment: FixtureEnvironment = "local",
) {
  if (!["local", "preview", "staging"].includes(environment))
    throw new Error("Unsupported fixture environment");
  if (!/^user_[A-Za-z0-9]+$/.test(teacherId)) throw new Error("Invalid teacher ID");
  return artifactKey(environment, [
    "_developer-fixtures",
    teacherId,
    "artifact-download",
    "worksheet.docx",
  ]);
}

export async function personalFixture(
  teacherId: string,
  method: "GET" | "POST" | "DELETE",
  environment: FixtureEnvironment = "local",
) {
  const key = personalFixtureKey(teacherId, environment);
  return getDatabaseClient().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
    const [row] = await tx
      .select({
        id: resourceArtifacts.id,
        teacherId: adaptations.clerkUserId,
        adaptationId: adaptations.id,
        jobId: transformationAttempts.jobId,
      })
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
      .where(eq(resourceArtifacts.storageKey, key));
    if (row && row.teacherId !== teacherId) throw new Error("Fixture owner mismatch");
    if (method === "DELETE") {
      await deleteArtifact(key);
      if (row) {
        await tx.delete(adaptations).where(eq(adaptations.id, row.adaptationId));
        await tx.delete(jobs).where(eq(jobs.id, row.jobId));
      }
      return { artifactId: null, stored: false, ready: false };
    }
    let metadata;
    try {
      metadata = await getArtifactMetadata(key);
    } catch (error) {
      if (!isArtifactNotFound(error)) throw error;
    }
    if (method === "GET")
      return {
        artifactId: row?.id ?? null,
        stored: !!metadata,
        ready: !!row && !!metadata,
      };
    if (!metadata) {
      const body = await Packer.toBuffer(
        new Document({
          title: downloadFixtureTitle,
          sections: [{ children: [new Paragraph(downloadFixtureTitle)] }],
        }),
      );
      await uploadArtifact({ key, body, contentType: downloadFixtureMimeType });
      metadata = await getArtifactMetadata(key);
    }
    const byteSize = Number(metadata.size);
    if (
      !Number.isSafeInteger(byteSize) ||
      byteSize <= 0 ||
      metadata.contentType !== downloadFixtureMimeType ||
      !metadata.md5Hash
    )
      throw new Error("Invalid fixture metadata");
    // Reconcile a deleted object or a rebuilt local database without changing other fixtures.
    let artifactId = row?.id;
    if (row) {
      await tx
        .update(resourceArtifacts)
        .set({ byteSize, checksum: metadata.md5Hash })
        .where(eq(resourceArtifacts.id, row.id));
    } else {
      const { expectedDocument } = await loadOriginalResourceDocumentFixture(
        "linear-equations-smoke",
      );
      artifactId = (
        await insertDownloadFixture(tx, {
          document: downloadFixtureDocument(expectedDocument),
          teacherId,
          key,
          byteSize,
          checksum: metadata.md5Hash,
        })
      ).id;
    }
    return { artifactId, stored: true, ready: true };
  });
}
