import {
  adaptations,
  getDatabaseClient,
  resourceArtifacts,
  resourceDocuments,
  transformationAttempts,
  transformations,
} from "@oaknational/resource-adapter-db";
import { and, eq, sql } from "drizzle-orm";

/** Generated artifacts belong to their adaptation's teacher, even after its head changes. */
export async function findOwnedArtifact(id: string, teacherId: string) {
  const [row] = await getDatabaseClient()
    .select({
      artifact: resourceArtifacts,
      // Only the title is read: parsing the stored document here would make a
      // later schema change break downloads of documents already written.
      title: sql<string | null>`case
        when jsonb_typeof(${resourceDocuments.document}->'metadata'->'title') = 'string'
        then ${resourceDocuments.document}->'metadata'->>'title'
        else null
      end`,
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
    .where(
      and(
        eq(resourceArtifacts.id, id),
        eq(resourceDocuments.origin, "generated"),
        eq(adaptations.clerkUserId, teacherId),
      ),
    )
    .limit(1);
  return row ?? null;
}
