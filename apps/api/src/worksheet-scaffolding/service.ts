import { downloadAvailability } from "./download-availability";
import {
  worksheetScaffoldingJobKinds,
  type WorksheetScaffoldingApplyRequest,
  type WorksheetScaffoldingReviewRequest,
  type WorksheetScaffoldingRetryTransformationRequest,
  type WorksheetScaffoldingRemoveRequest,
  type WorksheetScaffoldingJobKind,
  type WorksheetScaffoldingState,
  type WorksheetScaffoldingDismissRequest,
  type WorksheetScaffoldingRetrySuggestionsRequest,
  type UsageLimitReached,
  type ContentGuidance,
  type WithheldScaffold,
} from "@oaknational/resource-adapter-contracts/internal";
import { moderationCategoryLabel } from "@oaknational/resource-adapter-moderation";
import type { ResourceAdapterAuthenticatedTeacher } from "@oaknational/resource-adapter-contracts/server";
import {
  contributionIdsInDocument,
  getResourceNodeById,
} from "@oaknational/resource-document";
import { z } from "zod";

import { ConcurrencyConflictError } from "../jobs/job-repository";
import { jobJsonSchema, type JobJsonValue } from "../jobs/domain";
import { applySuggestionJob } from "../jobs/suggestions/apply-definition";
import { generateSuggestionsJob } from "../jobs/suggestions/generate-definition";
import { removeTransformationJob } from "../jobs/transformations/remove-definition";
import { retryTransformationJob } from "../jobs/transformations/retry-definition";
import { dismissTransformationsJob } from "../jobs/transformations/dismiss-definition";
import {
  isRegisteredTransformationKind,
  transformationDefinitions,
} from "../transformations/registry";
import { offeredParamsSchema } from "../transformations/offered-params";
import type { TransformationDefinition } from "../transformations/types";
import {
  adaptationHeadConcurrencyKey,
  SUGGESTION_FLOW_ID,
  applicationJobKey,
  dismissalJobKey,
  removalJobKey,
  suggestionOperationKey,
  suggestionRetryJobKey,
  transformationRetryJobKey,
} from "./capability";
import {
  defaultDependencies,
  type WorksheetScaffoldingDependencies,
  type WorksheetScaffoldingServiceRepository,
} from "./dependencies";
import { asParams, storedInputs, storedSupportLevel } from "./stored-params";

/** The job input is stored as JSON, so validated params are narrowed to it. */
function asJobParams(value: unknown): Record<string, JobJsonValue> {
  return z.record(z.string(), jobJsonSchema).parse(value);
}

function isSuggestionJobKind(kind: string): kind is WorksheetScaffoldingJobKind {
  return (worksheetScaffoldingJobKinds as readonly string[]).includes(kind);
}

function generationRequest(
  adaptationId: string,
  resourceDocumentId: string,
  teacherId: string,
) {
  return {
    concurrencyKey: adaptationHeadConcurrencyKey(adaptationId, resourceDocumentId),
    idempotencyKey: suggestionOperationKey(resourceDocumentId),
    input: { adaptationId, flowId: SUGGESTION_FLOW_ID, resourceDocumentId },
    kind: generateSuggestionsJob.kind,
    teacherId,
  } as const;
}

/**
 * An operation the teacher asked for is finished business once it succeeds. Reporting
 * it as the current job would hide the suggestion run that decides what happens next.
 */
function isSettledOperation(job: { kind: string; status: string }): boolean {
  return job.kind !== generateSuggestionsJob.kind && job.status === "succeeded";
}

const scaffoldJobKinds: ReadonlySet<string> = new Set([
  applySuggestionJob.kind,
  retryTransformationJob.kind,
]);

type FoundAttempt = Awaited<
  ReturnType<WorksheetScaffoldingServiceRepository["getAdaptationAttempt"]>
>;

/** The attempt a scaffold job ran, or null for any other job. */
function scaffoldJobAttempt(
  adaptationId: string,
  job: { id: string; kind: string } | null,
  { repository }: Pick<WorksheetScaffoldingDependencies, "repository">,
): Promise<FoundAttempt> {
  return job === null || !scaffoldJobKinds.has(job.kind)
    ? Promise.resolve(null)
    : repository.getAdaptationAttempt(adaptationId, { jobId: job.id });
}

function isWithheld(attempt: { moderationResult: string | null }): boolean {
  return (
    attempt.moderationResult === "highly-sensitive" ||
    attempt.moderationResult === "toxic"
  );
}

function withheldScaffold(found: FoundAttempt): WithheldScaffold | null {
  if (found === null) {
    return null;
  }
  const { attempt, transformation } = found;
  const { kind } = transformation;
  if (
    !isRegisteredTransformationKind(kind) ||
    (attempt.moderationResult !== "highly-sensitive" &&
      attempt.moderationResult !== "toxic")
  ) {
    return null;
  }
  return {
    attemptId: attempt.id,
    categories: attempt.moderationCategories ?? [],
    kind,
    label: transformationDefinitions[kind].label,
    safetyResult: attempt.moderationResult,
    targetBlockId: transformation.targetBlockId,
  };
}

function contentGuidance(attempt: {
  moderationCategories: readonly string[] | null;
  moderationResult: string | null;
}): readonly ContentGuidance[] {
  return attempt.moderationResult === "guidance-required"
    ? (attempt.moderationCategories ?? []).map((category) => ({
        category,
        label: moderationCategoryLabel(category),
      }))
    : [];
}

/** Execution retries a transformation only from the head it started from. */
async function startsFromHead(
  repository: Pick<
    WorksheetScaffoldingServiceRepository,
    "getPrimaryTransformationInput"
  >,
  transformationId: string,
  headId: string,
): Promise<boolean> {
  const input = await repository.getPrimaryTransformationInput(transformationId);
  return input?.id === headId;
}

/**
 * A failed retry stays visible while Try again could still run it. Without a
 * pending review that is not proof of acceptance: a withheld or failed
 * scaffold never had one, so the check is whether it still starts from the head.
 */
async function isSupersededRetryFailure(
  job: { input: unknown; kind: string; status: string },
  pending: Awaited<
    ReturnType<WorksheetScaffoldingServiceRepository["getPendingReview"]>
  >,
  { adaptationId, headId }: Readonly<{ adaptationId: string; headId: string }>,
  repository: Pick<
    WorksheetScaffoldingServiceRepository,
    "getAdaptationAttempt" | "getPrimaryTransformationInput"
  >,
): Promise<boolean> {
  if (job.kind !== retryTransformationJob.kind || job.status !== "failed") {
    return false;
  }
  const retry = retryTransformationJob.input.safeParse(job.input);
  if (!retry.success) {
    return false;
  }
  if (pending !== null) {
    return pending.attempt.id !== retry.data.attemptId;
  }
  const retried = await repository.getAdaptationAttempt(adaptationId, {
    attemptId: retry.data.attemptId,
  });
  return (
    retried === null ||
    !(await startsFromHead(repository, retried.transformation.id, headId))
  );
}

/**
 * A collision means other work already holds this head. The teacher's own read of
 * the state then shows them that job, which is more use than an error telling them
 * their worksheet could not be loaded.
 */
async function enqueueUnlessAlreadyRunning(
  enqueue: WorksheetScaffoldingDependencies["enqueue"],
  ...request: Parameters<WorksheetScaffoldingDependencies["enqueue"]>
): Promise<UsageLimitReached<"model_jobs_24h"> | null> {
  try {
    const result = await enqueue(...request);
    return result.outcome === "usageLimitReached" ? result.usageLimit : null;
  } catch (error) {
    if (!(error instanceof ConcurrencyConflictError)) {
      throw error;
    }
    return null;
  }
}

type LoadedAdaptation = Readonly<{
  headResourceDocumentId: string;
  state: WorksheetScaffoldingState;
}>;

async function readAdaptation(
  adaptationId: string,
  teacherId: string | undefined,
  {
    getLatestJob,
    repository,
  }: Pick<WorksheetScaffoldingDependencies, "getLatestJob" | "repository">,
): Promise<LoadedAdaptation | null> {
  const head = await repository.getAdaptationHead(adaptationId, teacherId);
  if (head === null) {
    return null;
  }

  const concurrencyKey = adaptationHeadConcurrencyKey(
    adaptationId,
    head.storedDocument.id,
  );
  const [rows, latestJob, latestGeneration, pending] = await Promise.all([
    repository.listOpenSuggestions(head.storedDocument.id),
    getLatestJob(concurrencyKey, worksheetScaffoldingJobKinds),
    getLatestJob(concurrencyKey, [generateSuggestionsJob.kind]),
    repository.getPendingReview(head.storedDocument.id),
  ]);
  const hidesLatestJob =
    latestJob !== null &&
    (isSettledOperation(latestJob) ||
      (await isSupersededRetryFailure(
        latestJob,
        pending,
        { adaptationId, headId: head.storedDocument.id },
        repository,
      )));
  const job = hidesLatestJob ? latestGeneration : latestJob;
  // A withheld scaffold's job succeeded, which hides it from `job`, so the
  // attempt is read from the latest job itself.
  const latestAttempt = await scaffoldJobAttempt(adaptationId, latestJob, {
    repository,
  });
  const retryableAttemptId =
    job !== null && job === latestJob && job.status === "failed"
      ? latestAttempt?.attempt.id
      : undefined;

  return {
    headResourceDocumentId: head.storedDocument.id,
    state: {
      adaptationId,
      modelWorkBlocked: null,
      document: head.storedDocument.document,
      resourceDocumentId: head.storedDocument.id,
      downloadAvailability: downloadAvailability(head),
      job:
        job === null || !isSuggestionJobKind(job.kind)
          ? null
          : {
              ...(retryableAttemptId === undefined
                ? {}
                : { attemptId: retryableAttemptId }),
              failureMessage: job.failureMessage,
              id: job.id,
              kind: job.kind,
              status: job.status,
            },
      pendingReview:
        pending === null || !isRegisteredTransformationKind(pending.transformation.kind)
          ? null
          : {
              attemptId: pending.attempt.id,
              contentGuidance: contentGuidance(pending.attempt),
              contributionId: pending.transformation.id,
              kind: pending.transformation.kind,
              label: transformationDefinitions[pending.transformation.kind].label,
              reason: pending.suggestion.reason,
              supportLevel: storedSupportLevel(pending.transformation.params),
              targetBlockId: pending.transformation.targetBlockId,
            },
      suggestions: rows.map((row) => {
        const definition = isRegisteredTransformationKind(row.kind)
          ? transformationDefinitions[row.kind]
          : undefined;
        const inputs = storedInputs(row.inputs);
        return {
          id: row.id,
          ...(inputs.length === 0 ? {} : { inputs }),
          kind: row.kind,
          label: definition?.label ?? row.kind,
          params: asParams(row.params),
          reason: row.reason,
          targetBlockId: row.targetBlockId,
        };
      }),
      withheld: withheldScaffold(latestAttempt),
    },
  };
}

/**
 * A worksheet with no offers has either never been reviewed or has just been
 * changed by an accepted scaffold. Anything else already has a run to wait for.
 */
function needsSuggestions(state: WorksheetScaffoldingState): boolean {
  if (state.suggestions.length > 0) {
    return false;
  }
  if (state.pendingReview !== null) {
    return false;
  }
  return state.job === null;
}

/**
 * Suggestions are requested here rather than by the job that changed the
 * worksheet, so that running a job never depends on the enqueuer that starts
 * the job runner. The request is keyed on the document, so concurrent readers
 * ask for the same run.
 */
async function readAndRequestSuggestions(
  adaptationId: string,
  teacherId: string,
  dependencies: WorksheetScaffoldingDependencies,
): Promise<WorksheetScaffoldingState | null> {
  const read = await readAdaptation(adaptationId, teacherId, dependencies);
  if (read === null || !needsSuggestions(read.state)) {
    return read?.state ?? null;
  }

  const modelWorkBlocked = await enqueueUnlessAlreadyRunning(
    dependencies.enqueue,
    generationRequest(adaptationId, read.headResourceDocumentId, teacherId),
  );
  if (modelWorkBlocked !== null) {
    return { ...read.state, modelWorkBlocked };
  }
  const refreshed = await readAdaptation(adaptationId, teacherId, dependencies);
  return refreshed?.state ?? read.state;
}

type AdaptationHead = NonNullable<
  Awaited<ReturnType<WorksheetScaffoldingServiceRepository["getAdaptationHead"]>>
>;

async function headWithoutPendingReview(
  { adaptationId }: Readonly<{ adaptationId: string }>,
  target: ResourceAdapterAuthenticatedTeacher,
  { repository }: Pick<WorksheetScaffoldingDependencies, "repository">,
): Promise<AdaptationHead | null> {
  const head = await repository.getAdaptationHead(adaptationId, target.teacherId);
  if (head === null) {
    return null;
  }
  return (await repository.getPendingReview(head.storedDocument.id)) === null
    ? head
    : null;
}

async function headUnderReview(
  { adaptationId, attemptId }: Readonly<{ adaptationId: string; attemptId: string }>,
  target: ResourceAdapterAuthenticatedTeacher,
  { repository }: Pick<WorksheetScaffoldingDependencies, "repository">,
) {
  const head = await repository.getAdaptationHead(adaptationId, target.teacherId);
  if (head === null) {
    return null;
  }
  const pending = await repository.getPendingReview(head.storedDocument.id);
  return pending?.attempt.id === attemptId ? { head, pending } : null;
}

/**
 * The head a retry of this attempt may run against: the scaffold awaiting
 * review, or, with none pending, the head's latest scaffold when moderation
 * withheld it or its job failed and it still starts from that head.
 */
async function headForRetry(
  input: Readonly<{ adaptationId: string; attemptId: string }>,
  target: ResourceAdapterAuthenticatedTeacher,
  dependencies: Pick<WorksheetScaffoldingDependencies, "getLatestJob" | "repository">,
): Promise<AdaptationHead | null> {
  const { repository } = dependencies;
  const head = await repository.getAdaptationHead(input.adaptationId, target.teacherId);
  if (head === null) {
    return null;
  }
  const pending = await repository.getPendingReview(head.storedDocument.id);
  if (pending !== null) {
    return pending.attempt.id === input.attemptId ? head : null;
  }

  const latestJob = await dependencies.getLatestJob(
    adaptationHeadConcurrencyKey(input.adaptationId, head.storedDocument.id),
    worksheetScaffoldingJobKinds,
  );
  const latest = await scaffoldJobAttempt(input.adaptationId, latestJob, dependencies);
  if (
    latest?.attempt.id !== input.attemptId ||
    (latestJob?.status !== "failed" && !isWithheld(latest.attempt))
  ) {
    return null;
  }
  return (await startsFromHead(
    repository,
    latest.transformation.id,
    head.storedDocument.id,
  ))
    ? head
    : null;
}

async function enqueueOnHead(
  head: AdaptationHead,
  { adaptationId }: Readonly<{ adaptationId: string }>,
  target: ResourceAdapterAuthenticatedTeacher,
  dependencies: WorksheetScaffoldingDependencies,
  request: Parameters<WorksheetScaffoldingDependencies["enqueue"]>[0],
): Promise<WorksheetScaffoldingState | null> {
  const modelWorkBlocked = await enqueueUnlessAlreadyRunning(dependencies.enqueue, {
    ...request,
    concurrencyKey: adaptationHeadConcurrencyKey(adaptationId, head.storedDocument.id),
  });
  const read = await readAdaptation(adaptationId, target.teacherId, dependencies);
  return read === null ? null : { ...read.state, modelWorkBlocked };
}

export async function getWorksheetScaffoldingState(
  adaptationId: string,
  target: ResourceAdapterAuthenticatedTeacher,
  dependencies: WorksheetScaffoldingDependencies = defaultDependencies,
): Promise<WorksheetScaffoldingState | null> {
  return readAndRequestSuggestions(adaptationId, target.teacherId, dependencies);
}

export async function enqueueSuggestionApplication(
  input: WorksheetScaffoldingApplyRequest,
  target: ResourceAdapterAuthenticatedTeacher,
  dependencies: WorksheetScaffoldingDependencies = defaultDependencies,
): Promise<WorksheetScaffoldingState | null> {
  const { repository } = dependencies;
  const head = await repository.getAdaptationHead(input.adaptationId, target.teacherId);
  if (head === null) {
    return null;
  }

  const suggestion = await repository.getOpenSuggestion(
    input.suggestionId,
    head.storedDocument.id,
  );
  if (suggestion === null || !isRegisteredTransformationKind(suggestion.kind)) {
    return null;
  }
  const params = asJobParams(
    offeredParamsSchema(
      transformationDefinitions[suggestion.kind] as TransformationDefinition,
      storedInputs(suggestion.inputs),
    ).parse(input.params ?? suggestion.params),
  );

  return enqueueOnHead(head, input, target, dependencies, {
    idempotencyKey: applicationJobKey(suggestion, params),
    input: {
      adaptationId: input.adaptationId,
      params,
      resourceDocumentId: head.storedDocument.id,
      suggestionId: input.suggestionId,
    },
    kind: applySuggestionJob.kind,
    teacherId: target.teacherId,
  });
}

export async function acceptWorksheetScaffoldingReview(
  input: WorksheetScaffoldingReviewRequest,
  target: ResourceAdapterAuthenticatedTeacher,
  dependencies: WorksheetScaffoldingDependencies = defaultDependencies,
): Promise<WorksheetScaffoldingState | null> {
  const review = await headUnderReview(input, target, dependencies);
  if (review === null) {
    return null;
  }
  const accepted = await dependencies.repository.acceptPendingReview({
    adaptationId: input.adaptationId,
    attemptId: input.attemptId,
    expectedHeadId: review.head.storedDocument.id,
  });
  if (!accepted) {
    return null;
  }
  return readAndRequestSuggestions(input.adaptationId, target.teacherId, dependencies);
}

export async function undoWorksheetScaffoldingReview(
  input: WorksheetScaffoldingReviewRequest,
  target: ResourceAdapterAuthenticatedTeacher,
  dependencies: WorksheetScaffoldingDependencies = defaultDependencies,
): Promise<WorksheetScaffoldingState | null> {
  const review = await headUnderReview(input, target, dependencies);
  if (review === null) {
    return null;
  }
  const { head, pending } = review;
  const { repository } = dependencies;
  const previous = await repository.getPrimaryTransformationInput(
    pending.transformation.id,
  );
  if (previous === null) {
    return null;
  }
  const undone = await repository.undoPendingReview({
    adaptationId: input.adaptationId,
    expectedHeadId: head.storedDocument.id,
    previousHeadId: previous.id,
    transformationId: pending.transformation.id,
  });
  if (!undone) {
    return null;
  }
  return readAndRequestSuggestions(input.adaptationId, target.teacherId, dependencies);
}

export async function enqueueWorksheetScaffoldingRetryTransformation(
  input: WorksheetScaffoldingRetryTransformationRequest,
  target: ResourceAdapterAuthenticatedTeacher,
  dependencies: WorksheetScaffoldingDependencies = defaultDependencies,
): Promise<WorksheetScaffoldingState | null> {
  const head = await headForRetry(input, target, dependencies);
  if (head === null) {
    return null;
  }
  return enqueueOnHead(head, input, target, dependencies, {
    idempotencyKey: transformationRetryJobKey(input.attemptId, input.requestId),
    input: {
      adaptationId: input.adaptationId,
      attemptId: input.attemptId,
      requestId: input.requestId,
      resourceDocumentId: head.storedDocument.id,
    },
    kind: retryTransformationJob.kind,
    teacherId: target.teacherId,
  });
}

export async function enqueueWorksheetScaffoldingRetrySuggestions(
  input: WorksheetScaffoldingRetrySuggestionsRequest,
  target: ResourceAdapterAuthenticatedTeacher,
  dependencies: WorksheetScaffoldingDependencies = defaultDependencies,
): Promise<WorksheetScaffoldingState | null> {
  const head = await headWithoutPendingReview(input, target, dependencies);
  if (head === null) {
    return null;
  }
  return enqueueOnHead(head, input, target, dependencies, {
    idempotencyKey: suggestionRetryJobKey(head.storedDocument.id, input.requestId),
    input: {
      adaptationId: input.adaptationId,
      flowId: SUGGESTION_FLOW_ID,
      resourceDocumentId: head.storedDocument.id,
    },
    kind: generateSuggestionsJob.kind,
    teacherId: target.teacherId,
  });
}

export async function enqueueWorksheetScaffoldingRemoval(
  input: WorksheetScaffoldingRemoveRequest,
  target: ResourceAdapterAuthenticatedTeacher,
  dependencies: WorksheetScaffoldingDependencies = defaultDependencies,
): Promise<WorksheetScaffoldingState | null> {
  const head = await headWithoutPendingReview(input, target, dependencies);
  if (head === null) {
    return null;
  }
  const isRemovable =
    contributionIdsInDocument(head.storedDocument.document).includes(
      input.contributionId,
    ) &&
    (await dependencies.repository.isAcceptedContribution(
      input.adaptationId,
      input.contributionId,
    ));
  if (!isRemovable) {
    return null;
  }
  return enqueueOnHead(head, input, target, dependencies, {
    idempotencyKey: removalJobKey(head.storedDocument.id, input.contributionId),
    input: {
      adaptationId: input.adaptationId,
      contributionId: input.contributionId,
      resourceDocumentId: head.storedDocument.id,
    },
    kind: removeTransformationJob.kind,
  });
}

export async function enqueueWorksheetScaffoldingDismissal(
  input: WorksheetScaffoldingDismissRequest,
  target: ResourceAdapterAuthenticatedTeacher,
  dependencies: WorksheetScaffoldingDependencies = defaultDependencies,
): Promise<WorksheetScaffoldingState | null> {
  const head = await headWithoutPendingReview(input, target, dependencies);
  if (head === null) {
    return null;
  }
  if (
    input.targetBlockId !== null &&
    getResourceNodeById(head.storedDocument.document, input.targetBlockId) === undefined
  ) {
    return null;
  }
  return enqueueOnHead(head, input, target, dependencies, {
    idempotencyKey: dismissalJobKey(head.storedDocument.id, input.targetBlockId),
    input: {
      adaptationId: input.adaptationId,
      resourceDocumentId: head.storedDocument.id,
      targetBlockId: input.targetBlockId,
    },
    kind: dismissTransformationsJob.kind,
  });
}
