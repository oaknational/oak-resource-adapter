import {
  getDatabaseClient,
  resourceDocuments,
  suggestedTransformations,
  transformationAttempts,
  transformations,
} from "@oaknational/resource-adapter-db";
import type {
  SafetyResult,
  WithheldSafetyResult,
} from "@oaknational/resource-adapter-moderation";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { ResourceDocument } from "@oaknational/resource-document";
import { parseResourceDocument } from "@oaknational/resource-document/parse";

export const PRIMARY_SOURCE = "primary_source";

export type Transaction = Parameters<
  Parameters<ReturnType<typeof getDatabaseClient>["transaction"]>[0]
>[0];

/** What moderation decided about an attempt's generated content. */
export type AttemptModeration<Result extends SafetyResult = SafetyResult> = Readonly<{
  result: Result;
  categories: readonly string[];
}>;

/** A result that lets the generated content reach the head. */
export type ShownModeration = AttemptModeration<
  Exclude<SafetyResult, WithheldSafetyResult>
>;

export type WithheldModeration = AttemptModeration<WithheldSafetyResult>;

export function moderationColumns(moderation: AttemptModeration | undefined) {
  return moderation === undefined
    ? {}
    : {
        moderationCategories: [...moderation.categories],
        moderationResult: moderation.result,
      };
}

export function markAttemptComplete(
  transaction: Transaction,
  attemptId: string,
  review: "accepted" | "pending" = "pending",
  moderation?: ShownModeration,
) {
  const completedAt = new Date();
  return transaction
    .update(transformationAttempts)
    .set({
      completedAt,
      ...(review === "pending" ? {} : { acceptedAt: completedAt }),
      ...moderationColumns(moderation),
    })
    .where(eq(transformationAttempts.id, attemptId));
}

/**
 * The head document, only while one completed but unaccepted attempt of this
 * adaptation still owns it. Used as an `exists` guard so a stale request cannot
 * accept, undo or overwrite a review that has already moved on.
 */
export function pendingAttemptOwnsHead(
  transaction: Transaction,
  input: { adaptationId: string; attemptId: string; resourceDocumentId: string },
) {
  return transaction
    .select({ id: resourceDocuments.id })
    .from(resourceDocuments)
    .innerJoin(
      transformationAttempts,
      eq(transformationAttempts.id, resourceDocuments.transformationAttemptId),
    )
    .innerJoin(
      transformations,
      eq(transformations.id, transformationAttempts.transformationId),
    )
    .where(
      and(
        eq(resourceDocuments.id, input.resourceDocumentId),
        eq(transformationAttempts.id, input.attemptId),
        eq(transformations.adaptationId, input.adaptationId),
        isNull(transformationAttempts.acceptedAt),
        isNotNull(transformationAttempts.completedAt),
      ),
    );
}

export type StoredSuggestion = typeof suggestedTransformations.$inferSelect;
export type StoredAttempt = typeof transformationAttempts.$inferSelect;
export type StoredTransformation = typeof transformations.$inferSelect;

export type ParsedStoredDocument = Omit<
  typeof resourceDocuments.$inferSelect,
  "document"
> &
  Readonly<{ document: ResourceDocument }>;

/**
 * Stored documents leave the repository only through here, so older schema
 * versions are upgraded in memory. Stored rows are not rewritten.
 */
export function parseStoredDocumentRow(
  row: typeof resourceDocuments.$inferSelect,
): ParsedStoredDocument {
  return { ...row, document: parseResourceDocument(row.document) };
}
