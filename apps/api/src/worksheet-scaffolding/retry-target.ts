import type * as scaffoldingRepository from "./repository";

export type RetryTarget = Readonly<{
  /** Set when the retry replaces a scaffold still awaiting review. */
  pendingAttemptId?: string;
  transformation: scaffoldingRepository.StoredTransformation;
}>;

/**
 * What a retry of this attempt reruns: the scaffold awaiting review or, with
 * none pending, an unaccepted scaffold that starts from the head. Starting
 * anywhere else would drop whatever reached the worksheet since.
 */
export async function retryTarget(
  repository: Pick<
    typeof scaffoldingRepository,
    "getAdaptationAttempt" | "getPrimaryTransformationInput"
  >,
  input: Readonly<{
    adaptationId: string;
    attemptId: string;
    headId: string;
    pending: scaffoldingRepository.PendingReview | null;
  }>,
): Promise<RetryTarget | null> {
  if (input.pending !== null) {
    return input.pending.attempt.id === input.attemptId
      ? {
          pendingAttemptId: input.attemptId,
          transformation: input.pending.transformation,
        }
      : null;
  }
  const found = await repository.getAdaptationAttempt(input.adaptationId, {
    attemptId: input.attemptId,
  });
  if (found?.attempt.acceptedAt !== null) {
    return null;
  }
  const source = await repository.getPrimaryTransformationInput(
    found.transformation.id,
  );
  return source?.id === input.headId ? { transformation: found.transformation } : null;
}
