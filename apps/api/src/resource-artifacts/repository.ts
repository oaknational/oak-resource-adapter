import {
  adaptations,
  getDatabaseClient,
  resourceArtifacts,
  resourceDocuments,
  transformationAttempts,
  transformationInputs,
  transformations,
} from "@oaknational/resource-adapter-db";
import { and, eq, exists, or, sql } from "drizzle-orm";

import { isPrimarySourceOf } from "../worksheet-scaffolding/repository/shared";

/**
 * Generated artifacts belong to their adaptation's teacher, even after its head
 * changes. An original Oak document's artifact belongs to the teacher whose
 * adaptation transformed it; other original artifacts are refused.
 */
export async function findOwnedArtifact(id: string, teacherId: string) {
  const database = getDatabaseClient();
  const ownedTransformations = () =>
    database
      .select({ id: transformations.id })
      .from(transformations)
      .innerJoin(adaptations, eq(adaptations.id, transformations.adaptationId));
  const generatedByTeacher = exists(
    ownedTransformations()
      .innerJoin(
        transformationAttempts,
        eq(transformationAttempts.transformationId, transformations.id),
      )
      .where(
        and(
          eq(transformationAttempts.id, resourceDocuments.transformationAttemptId),
          eq(adaptations.clerkUserId, teacherId),
        ),
      ),
  );
  const adaptedByTeacher = exists(
    ownedTransformations()
      .innerJoin(transformationInputs, isPrimarySourceOf(transformations.id))
      .where(
        and(
          eq(transformationInputs.resourceDocumentId, resourceDocuments.id),
          eq(adaptations.clerkUserId, teacherId),
        ),
      ),
  );
  const [row] = await database
    .select({
      artifact: resourceArtifacts,
      origin: resourceDocuments.origin,
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
    .where(
      and(
        eq(resourceArtifacts.id, id),
        or(
          and(eq(resourceDocuments.origin, "generated"), generatedByTeacher),
          and(eq(resourceDocuments.origin, "oak_resource"), adaptedByTeacher),
        ),
      ),
    )
    .limit(1);
  return row ?? null;
}
