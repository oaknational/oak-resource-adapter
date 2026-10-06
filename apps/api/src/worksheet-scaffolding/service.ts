import { downloadAvailability } from "./download-availability";
import {
  worksheetScaffoldingJobKinds,
  type WorksheetScaffoldingApplyRequest,
  type WorksheetScaffoldingReviewRequest,
  type WorksheetScaffoldingRetryTransformationRequest,
  type WorksheetScaffoldingEntry,
  type WorksheetScaffoldingOpenRequest,
  type WorksheetScaffoldingRemoveRequest,
  type WorksheetScaffoldingJobKind,
  type WorksheetScaffoldingState,
  type WorksheetScaffoldingDismissRequest,
  type WorksheetScaffoldingRetrySuggestionsRequest,
} from "@oaknational/resource-adapter-contracts/internal";
import type { ResourceAdapterAuthenticatedTeacher } from "@oaknational/resource-adapter-contracts/server";
import {
  contributionIdsInDocument,
  getResourceNodeById,
} from "@oaknational/resource-document";
import { z } from "zod";

import { enqueueJob } from "../jobs/enqueue-job";
import {
  ConcurrencyConflictError,
  getLatestJobForConcurrencyKey,
} from "../jobs/job-repository";
import { jobJsonSchema, type JobJsonValue } from "../jobs/domain";
import { applySuggestionJob } from "../jobs/suggestions/apply-definition";
import { generateSuggestionsJob } from "../jobs/suggestions/generate-definition";
import { removeTransformationJob } from "../jobs/transformations/remove-definition";
import { retryTransformationJob } from "../jobs/transformations/retry-definition";
import { dismissTransformationsJob } from "../jobs/transformations/dismiss-definition";
import { getSourceDocument } from "../source-documents/service";
import {
  isRegisteredTransformationKind,
  transformationDefinitions,
} from "../transformations/registry";
import {
  adaptationHeadConcurrencyKey,
  CAPABILITY,
  SUGGESTION_FLOW_ID,
  applicationJobKey,
  dismissalJobKey,
  removalJobKey,
  suggestionOperationKey,
  suggestionRetryJobKey,
  transformationRetryJobKey,
} from "./capability";
import * as scaffoldingRepository from "./repository";
import { asParams, storedSupportLevel } from "./stored-params";

/**
 * How long unfinished work stays on offer. Long enough to cover a teacher
 * returning to their planning the following week, short enough that last term's
 * half-finished worksheet does not reappear without explanation.
 */
const RESUMABLE_WINDOW_DAYS = 30;

export type WorksheetScaffoldingDependencies = {
  enqueue: typeof enqueueJob;
  getLatestJob: typeof getLatestJobForConcurrencyKey;
  resumableCutoff: (windowDays: number) => Date;
  readSourceDocument: typeof getSourceDocument;
  repository: WorksheetScaffoldingServiceRepository;
};

export type WorksheetScaffoldingServiceRepository = Pick<
  typeof scaffoldingRepository,
  | "createAdaptationWithSourceDocument"
  | "acceptPendingReview"
  | "findResumableAdaptation"
  | "getAdaptationHead"
  | "getOpenSuggestion"
  | "getPendingReview"
  | "getPrimaryTransformationInput"
  | "isAcceptedContribution"
  | "listOpenSuggestions"
  | "replaceAdaptationWithSourceDocument"
  | "undoPendingReview"
>;

const defaultDependencies: WorksheetScaffoldingDependencies = {
  enqueue: enqueueJob,
  getLatestJob: getLatestJobForConcurrencyKey,
  resumableCutoff: (windowDays) =>
    new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000),
  readSourceDocument: getSourceDocument,
  repository: scaffoldingRepository,
};

/** The job input is stored as JSON, so validated params are narrowed to it. */
function asJobParams(value: unknown): Record<string, JobJsonValue> {
  return z.record(z.string(), jobJsonSchema).parse(value);
}

function isSuggestionJobKind(kind: string): kind is WorksheetScaffoldingJobKind {
  return (worksheetScaffoldingJobKinds as readonly string[]).includes(kind);
}

function generationRequest(adaptationId: string, resourceDocumentId: string) {
  return {
    concurrencyKey: adaptationHeadConcurrencyKey(adaptationId, resourceDocumentId),
    idempotencyKey: suggestionOperationKey(resourceDocumentId),
    input: { adaptationId, flowId: SUGGESTION_FLOW_ID, resourceDocumentId },
    kind: generateSuggestionsJob.kind,
  } as const;
}

/**
 * An operation the teacher asked for is finished business once it succeeds. Reporting
 * it as the current job would hide the suggestion run that decides what happens next.
 */
function isSettledOperation(job: { kind: string; status: string }): boolean {
  return job.kind !== generateSuggestionsJob.kind && job.status === "succeeded";
}

function isSupersededRetryFailure(
  job: { input: unknown; kind: string; status: string },
  pending: Awaited<
    ReturnType<WorksheetScaffoldingServiceRepository["getPendingReview"]>
  >,
): boolean {
  if (job.kind !== retryTransformationJob.kind || job.status !== "failed") {
    return false;
  }
  const retry = retryTransformationJob.input.safeParse(job.input);
  return retry.success && pending?.attempt.id !== retry.data.attemptId;
}

/**
 * A collision means other work already holds this head. The teacher's own read of
 * the state then shows them that job, which is more use than an error telling them
 * their worksheet could not be loaded.
 */
async function enqueueUnlessAlreadyRunning(
  enqueue: WorksheetScaffoldingDependencies["enqueue"],
  ...request: Parameters<WorksheetScaffoldingDependencies["enqueue"]>
): Promise<void> {
  try {
    await enqueue(...request);
  } catch (error) {
    if (!(error instanceof ConcurrencyConflictError)) {
      throw error;
    }
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
  const job =
    latestJob !== null &&
    (isSettledOperation(latestJob) || isSupersededRetryFailure(latestJob, pending))
      ? latestGeneration
      : latestJob;

  return {
    headResourceDocumentId: head.storedDocument.id,
    state: {
      adaptationId,
      document: head.storedDocument.document,
      resourceDocumentId: head.storedDocument.id,
      downloadAvailability: downloadAvailability(head),
      job:
        job === null || !isSuggestionJobKind(job.kind)
          ? null
          : {
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
        return {
          id: row.id,
          ...(definition?.inputs === undefined ? {} : { inputs: definition.inputs }),
          kind: row.kind,
          label: definition?.label ?? row.kind,
          params: asParams(row.params),
          reason: row.reason,
          targetBlockId: row.targetBlockId,
        };
      }),
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
  teacherId: string | undefined,
  dependencies: WorksheetScaffoldingDependencies,
): Promise<WorksheetScaffoldingState | null> {
  const read = await readAdaptation(adaptationId, teacherId, dependencies);
  if (read === null || !needsSuggestions(read.state)) {
    return read?.state ?? null;
  }

  await enqueueUnlessAlreadyRunning(
    dependencies.enqueue,
    generationRequest(adaptationId, read.headResourceDocumentId),
  );
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

async function enqueueOnHead(
  head: AdaptationHead,
  { adaptationId }: Readonly<{ adaptationId: string }>,
  target: ResourceAdapterAuthenticatedTeacher,
  dependencies: WorksheetScaffoldingDependencies,
  request: Parameters<WorksheetScaffoldingDependencies["enqueue"]>[0],
): Promise<WorksheetScaffoldingState | null> {
  await enqueueUnlessAlreadyRunning(dependencies.enqueue, {
    ...request,
    concurrencyKey: adaptationHeadConcurrencyKey(adaptationId, head.storedDocument.id),
  });
  const read = await readAdaptation(adaptationId, target.teacherId, dependencies);
  return read?.state ?? null;
}

export async function getWorksheetScaffoldingState(
  adaptationId: string,
  target: ResourceAdapterAuthenticatedTeacher,
  dependencies: WorksheetScaffoldingDependencies = defaultDependencies,
): Promise<WorksheetScaffoldingState | null> {
  return readAndRequestSuggestions(adaptationId, target.teacherId, dependencies);
}

export async function openWorksheetScaffolding(
  request: WorksheetScaffoldingOpenRequest,
  target: ResourceAdapterAuthenticatedTeacher,
  dependencies: WorksheetScaffoldingDependencies = defaultDependencies,
): Promise<WorksheetScaffoldingEntry | null> {
  const { lesson, replacing } = request;
  const { repository } = dependencies;

  if (replacing === undefined) {
    const resumable = await repository.findResumableAdaptation({
      capabilityId: CAPABILITY.id,
      lesson,
      notBefore: dependencies.resumableCutoff(RESUMABLE_WINDOW_DAYS),
      teacherId: target.teacherId,
    });
    if (resumable !== null) {
      return {
        outcome: "resumable",
        resumable: {
          adaptationId: resumable.id,
          pendingScaffoldCount: resumable.pendingScaffoldCount,
          scaffoldCount: resumable.scaffoldCount,
          updatedAt: resumable.updatedAt.toISOString(),
        },
      };
    }
  }

  const document = await dependencies.readSourceDocument(
    { capabilityId: CAPABILITY.id, lesson },
    target,
  );
  if (document === null) {
    return null;
  }

  const adaptationInput = {
    capabilityId: CAPABILITY.id,
    document,
    lesson,
    teacherId: target.teacherId,
  };
  const { adaptationId } =
    replacing === undefined
      ? await repository.createAdaptationWithSourceDocument(adaptationInput)
      : await repository.replaceAdaptationWithSourceDocument({
          ...adaptationInput,
          replacingAdaptationId: replacing.adaptationId,
          replacementRequestId: replacing.requestId,
        });

  const state = await readAndRequestSuggestions(
    adaptationId,
    target.teacherId,
    dependencies,
  );
  return state === null ? null : { outcome: "opened", state };
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
    transformationDefinitions[suggestion.kind].params.parse(
      input.params ?? suggestion.params,
    ),
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
  const review = await headUnderReview(input, target, dependencies);
  if (review === null) {
    return null;
  }
  const { head } = review;
  return enqueueOnHead(head, input, target, dependencies, {
    idempotencyKey: transformationRetryJobKey(input.attemptId, input.requestId),
    input: {
      adaptationId: input.adaptationId,
      attemptId: input.attemptId,
      requestId: input.requestId,
      resourceDocumentId: head.storedDocument.id,
    },
    kind: retryTransformationJob.kind,
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
