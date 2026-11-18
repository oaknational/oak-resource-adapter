import {
  contributionIdsInDocument,
  getResourceNodeById,
  type ResourceDocument,
} from "@oaknational/resource-document";

import { createApplicationModelInvoker } from "../ai/application-invoker";
import { getJob } from "../jobs/job-repository";
import type { ScaffoldSubject } from "../moderation/deterministic-moderator";
import { createApplicationModerator } from "../moderation/moderation-configuration";
import { applySuggestionJob } from "../jobs/suggestions/apply-definition";
import { generateSuggestionsJob } from "../jobs/suggestions/generate-definition";
import { removeTransformationJob } from "../jobs/transformations/remove-definition";
import { retryTransformationJob } from "../jobs/transformations/retry-definition";
import { dismissTransformationsJob } from "../jobs/transformations/dismiss-definition";
import { readLessonFacts } from "../curriculum/read-lesson-facts";
import { suggestionFlowDefinitions } from "../suggestions/registry";
import {
  generateSuggestions,
  suggestionMaterialRequirements,
} from "../suggestions/service";
import { resolveApplicationMaterial } from "../transformations/application-material-resolver";
import {
  executeRegisteredTransformation,
  type ResolveTransformationMaterial,
} from "../transformations/application-service";
import {
  isRegisteredTransformationKind,
  transformationDefinitions,
  type RegisteredTransformationKind,
} from "../transformations/registry";
import type { AppliedTransformationSummary } from "../transformations/types";
import { removeAdditiveContribution } from "../transformations/remove-additive-contribution";
import { dismissTransformationsAt } from "../transformations/dismissal";
import { executeAcceptedDocumentOperation } from "../transformations/operations/execute-document-operation";
import {
  REMOVAL_OPERATION_KIND,
  SUGGESTION_OPERATION_KIND,
  DISMISSAL_OPERATION_KIND,
  suggestionOperationKey,
} from "./capability";
import { moderateScaffold } from "./moderate-scaffold";
import * as scaffoldingRepository from "./repository";
import type { GeneratedOutput } from "./repository";
import { retryTarget } from "./retry-target";
import { asParams } from "./stored-params";

const REVISED_RESOURCE = "revised-resource";

/**
 * Running a job must not reach the job enqueuer: the workflow that dispatches
 * these steps is what the enqueuer starts, so an import back would tie the two
 * together. Follow-up generation is requested when the state is next read.
 */
export type WorksheetScaffoldingJobDependencies = {
  createInvoker: typeof createApplicationModelInvoker;
  createModerator: typeof createApplicationModerator;
  executeTransformation: typeof executeRegisteredTransformation;
  generate: typeof generateSuggestions;
  readFacts: typeof readLessonFacts;
  readJob: typeof getJob;
  repository: WorksheetScaffoldingExecutionRepository;
  resolveMaterial: ResolveTransformationMaterial;
};

export type WorksheetScaffoldingExecutionRepository = Pick<
  typeof scaffoldingRepository,
  | "acceptSuggestion"
  | "completeWithheldAttempt"
  | "createOperationAttempt"
  | "createRetryAttempt"
  | "getAcceptedSuggestion"
  | "getAdaptationAttempt"
  | "getAdaptationHead"
  | "getAttemptForJob"
  | "getOpenSuggestion"
  | "getPendingReview"
  | "getPrimaryTransformationInput"
  | "isAcceptedContribution"
  | "isAttemptComplete"
  | "listAppliedTransformations"
  | "storeOutputsAndAdvanceHead"
  | "completeSuggestionAttempt"
  | "findSuggestionGeneration"
>;

const defaultDependencies: WorksheetScaffoldingJobDependencies = {
  createInvoker: createApplicationModelInvoker,
  createModerator: createApplicationModerator,
  executeTransformation: executeRegisteredTransformation,
  generate: generateSuggestions,
  readFacts: readLessonFacts,
  readJob: getJob,
  repository: scaffoldingRepository,
  resolveMaterial: resolveApplicationMaterial,
};

function lessonOf(
  adaptation: Readonly<{ lessonSlug: string | null; programmeSlug: string | null }>,
) {
  return adaptation.lessonSlug === null || adaptation.programmeSlug === null
    ? undefined
    : { lessonSlug: adaptation.lessonSlug, programmeSlug: adaptation.programmeSlug };
}

export async function executeRemoveTransformation(
  jobId: string,
  dependencies: WorksheetScaffoldingJobDependencies = defaultDependencies,
): Promise<void> {
  const job = await dependencies.readJob(jobId);
  if (job?.kind !== removeTransformationJob.kind) {
    throw new Error("The removal job does not exist or has the wrong kind.");
  }
  const input = removeTransformationJob.input.parse(job.input);
  await executeAcceptedDocumentOperation({
    adaptationId: input.adaptationId,
    expectedHeadId: input.resourceDocumentId,
    idempotencyKey: job.idempotencyKey,
    jobId,
    kind: REMOVAL_OPERATION_KIND,
    operationName: "The removal",
    repository: dependencies.repository,
    revise: (document) => removeAdditiveContribution(document, input.contributionId),
    validate: async (document) => {
      if (
        !contributionIdsInDocument(document).includes(input.contributionId) ||
        !(await dependencies.repository.isAcceptedContribution(
          input.adaptationId,
          input.contributionId,
        ))
      ) {
        throw new Error("The contribution is not accepted on this document.");
      }
    },
  });
}

function revisedOutputPosition(kind: RegisteredTransformationKind): number {
  const position = transformationDefinitions[kind].outputs.indexOf(REVISED_RESOURCE);
  if (position < 0) {
    throw new Error(`${kind} does not produce a revised resource.`);
  }
  return position;
}

async function appliedTransformationHistory(
  adaptationId: string,
  document: ResourceDocument,
  repository: WorksheetScaffoldingJobDependencies["repository"],
): Promise<readonly AppliedTransformationSummary[]> {
  const rows = await repository.listAppliedTransformations(
    adaptationId,
    contributionIdsInDocument(document),
  );

  return rows
    .filter(({ kind }) => isRegisteredTransformationKind(kind))
    .map((row) => ({
      kind: row.kind,
      params: asParams(row.params),
      ...(row.targetBlockId === null ? {} : { targetBlockId: row.targetBlockId }),
    }));
}

export async function executeGenerateSuggestions(
  jobId: string,
  dependencies: WorksheetScaffoldingJobDependencies = defaultDependencies,
): Promise<void> {
  const { repository } = dependencies;
  const job = await dependencies.readJob(jobId);
  if (job?.kind !== generateSuggestionsJob.kind) {
    throw new Error("The suggestion job does not exist or has the wrong kind.");
  }
  const input = generateSuggestionsJob.input.parse(job.input);
  const head = await repository.getAdaptationHead(input.adaptationId);
  if (head?.storedDocument.id !== input.resourceDocumentId) {
    throw new Error("The suggestion job no longer targets the adaptation head.");
  }

  let attempt = await repository.getAttemptForJob(jobId);
  if (attempt === null) {
    const suggestionGeneration = await repository.findSuggestionGeneration(
      input.resourceDocumentId,
    );
    attempt =
      suggestionGeneration === null
        ? await repository.createOperationAttempt({
            adaptationId: input.adaptationId,
            idempotencyKey: suggestionOperationKey(input.resourceDocumentId),
            jobId,
            kind: SUGGESTION_OPERATION_KIND,
            resourceDocumentId: input.resourceDocumentId,
          })
        : await repository.createRetryAttempt({
            jobId,
            transformationId: suggestionGeneration.id,
          });
  }

  if (await repository.isAttemptComplete(attempt.id)) {
    return;
  }

  const document = head.storedDocument.document;
  const flow = suggestionFlowDefinitions[input.flowId];
  const createInvoker = () =>
    dependencies.createInvoker(attempt.id, head.adaptation.clerkUserId);
  const lesson = lessonOf(head.adaptation);
  const [{ material }, facts] = await Promise.all([
    dependencies.resolveMaterial(
      suggestionMaterialRequirements(flow),
      lesson,
      createInvoker,
    ),
    dependencies.readFacts(lesson),
  ]);
  const suggestions = await dependencies.generate(
    flow,
    document,
    await appliedTransformationHistory(input.adaptationId, document, repository),
    {
      correlationKey: jobId,
      createInvoker,
      lesson: { identity: lesson ?? null, material, facts },
    },
  );

  await repository.completeSuggestionAttempt({
    attemptId: attempt.id,
    resourceDocumentId: input.resourceDocumentId,
    suggestions,
  });
}

/**
 * Generated content reaches the head only once moderation shows it. Withheld
 * content completes the attempt and leaves the head where it was.
 */
async function moderateAndStore(
  dependencies: WorksheetScaffoldingJobDependencies,
  input: Readonly<{
    adaptationId: string;
    attemptId: string;
    contributionId: string;
    expectedHeadId: string;
    expectedPendingAttemptId?: string;
    outputs: readonly GeneratedOutput[];
    revisedPosition: number;
    subject: ScaffoldSubject;
  }>,
): Promise<void> {
  const revised = input.outputs[input.revisedPosition];
  if (revised === undefined) {
    throw new Error("The transformation did not produce a revised resource.");
  }
  const moderated = await moderateScaffold(dependencies.createModerator(), {
    adaptationId: input.adaptationId,
    attemptId: input.attemptId,
    contributionId: input.contributionId,
    document: revised.document,
    subject: input.subject,
  });
  if (!moderated.shown) {
    await dependencies.repository.completeWithheldAttempt({
      attemptId: input.attemptId,
      moderation: moderated.moderation,
    });
    return;
  }

  await dependencies.repository.storeOutputsAndAdvanceHead({
    adaptationId: input.adaptationId,
    attemptId: input.attemptId,
    expectedHeadId: input.expectedHeadId,
    ...(input.expectedPendingAttemptId === undefined
      ? {}
      : { expectedPendingAttemptId: input.expectedPendingAttemptId }),
    moderation: moderated.moderation,
    outputs: input.outputs,
    revisedPosition: input.revisedPosition,
  });
}

async function resolveAcceptedSuggestion(
  jobId: string,
  input: {
    adaptationId: string;
    params: Readonly<Record<string, unknown>>;
    suggestionId: string;
  },
  idempotencyKey: string,
  repository: WorksheetScaffoldingJobDependencies["repository"],
) {
  const existing = await repository.getAcceptedSuggestion(jobId, input.suggestionId);
  if (existing !== null) {
    return existing;
  }

  const head = await repository.getAdaptationHead(input.adaptationId);
  if (head === null) {
    throw new Error("The worksheet scaffolding adaptation does not exist.");
  }
  const suggestion = await repository.getOpenSuggestion(
    input.suggestionId,
    head.storedDocument.id,
  );
  if (suggestion === null || !isRegisteredTransformationKind(suggestion.kind)) {
    throw new Error("The suggestion is unavailable or has an unknown transformation.");
  }

  return repository.acceptSuggestion({
    adaptationId: input.adaptationId,
    head,
    idempotencyKey,
    jobId,
    params: transformationDefinitions[suggestion.kind].params.parse(input.params),
    suggestion,
  });
}

export async function executeApplySuggestion(
  jobId: string,
  dependencies: WorksheetScaffoldingJobDependencies = defaultDependencies,
): Promise<void> {
  const { repository } = dependencies;
  const job = await dependencies.readJob(jobId);
  if (job?.kind !== applySuggestionJob.kind) {
    throw new Error(
      "The suggestion application job does not exist or has the wrong kind.",
    );
  }
  const input = applySuggestionJob.input.parse(job.input);
  const { adaptation, attempt, sourceDocument, suggestion, transformation } =
    await resolveAcceptedSuggestion(jobId, input, job.idempotencyKey, repository);

  if (
    transformation.adaptationId !== input.adaptationId ||
    !isRegisteredTransformationKind(transformation.kind) ||
    suggestion.kind !== transformation.kind
  ) {
    throw new Error("The accepted suggestion does not match this application job.");
  }
  const params = transformationDefinitions[transformation.kind].params.parse(
    asParams(transformation.params),
  );
  const revisedPosition = revisedOutputPosition(transformation.kind);

  if (await repository.isAttemptComplete(attempt.id)) {
    return;
  }

  const { run } = await dependencies.executeTransformation(
    {
      contributionId: transformation.id,
      document: sourceDocument.document,
      kind: transformation.kind,
      lesson: lessonOf(adaptation),
      params,
      targetBlockId: transformation.targetBlockId ?? undefined,
    },
    {
      createInvoker: () =>
        dependencies.createInvoker(attempt.id, adaptation.clerkUserId),
      resolveMaterial: dependencies.resolveMaterial,
    },
  );
  if (run.outcome !== "APPLIED") {
    throw new Error(`The accepted transformation ended with ${run.outcome}.`);
  }

  await moderateAndStore(dependencies, {
    adaptationId: input.adaptationId,
    attemptId: attempt.id,
    contributionId: transformation.id,
    expectedHeadId: sourceDocument.id,
    outputs: run.outputs,
    revisedPosition,
    subject: {
      attemptNumber: attempt.attemptNumber,
      kind: transformation.kind,
      lessonSlug: adaptation.lessonSlug,
    },
  });
}

export async function executeRetryTransformation(
  jobId: string,
  dependencies: WorksheetScaffoldingJobDependencies = defaultDependencies,
): Promise<void> {
  const { repository } = dependencies;
  const job = await dependencies.readJob(jobId);

  if (job?.kind !== retryTransformationJob.kind) {
    throw new Error("The retry job does not exist or has the wrong kind.");
  }
  const input = retryTransformationJob.input.parse(job.input);
  const existingAttempt = await repository.getAttemptForJob(jobId);
  if (
    existingAttempt !== null &&
    (await repository.isAttemptComplete(existingAttempt.id))
  ) {
    return;
  }
  const head = await repository.getAdaptationHead(input.adaptationId);
  if (head?.storedDocument.id !== input.resourceDocumentId) {
    throw new Error("The retry no longer targets the adaptation head.");
  }
  const target = await retryTarget(repository, {
    adaptationId: input.adaptationId,
    attemptId: input.attemptId,
    headId: head.storedDocument.id,
    pending: await repository.getPendingReview(head.storedDocument.id),
  });
  if (target === null) {
    throw new Error("The retry no longer targets a transformation it can rerun.");
  }
  const { pendingAttemptId, transformation } = target;
  if (!isRegisteredTransformationKind(transformation.kind)) {
    throw new Error("The retry targets an unknown transformation.");
  }

  const attempt =
    existingAttempt ??
    (await repository.createRetryAttempt({
      jobId,
      transformationId: transformation.id,
    }));
  const sourceDocument = await repository.getPrimaryTransformationInput(
    transformation.id,
  );
  if (sourceDocument === null) {
    throw new Error("The transformation input for the retry is missing.");
  }

  const params = transformationDefinitions[transformation.kind].params.parse(
    asParams(transformation.params),
  );
  const revisedPosition = revisedOutputPosition(transformation.kind);
  const { run } = await dependencies.executeTransformation(
    {
      contributionId: transformation.id,
      document: sourceDocument.document,
      kind: transformation.kind,
      lesson: lessonOf(head.adaptation),
      params,
      targetBlockId: transformation.targetBlockId ?? undefined,
    },
    {
      createInvoker: () =>
        dependencies.createInvoker(attempt.id, head.adaptation.clerkUserId),
      resolveMaterial: dependencies.resolveMaterial,
    },
  );
  if (run.outcome !== "APPLIED") {
    throw new Error(`The retried transformation ended with ${run.outcome}.`);
  }

  await moderateAndStore(dependencies, {
    adaptationId: input.adaptationId,
    attemptId: attempt.id,
    contributionId: transformation.id,
    expectedHeadId: input.resourceDocumentId,
    ...(pendingAttemptId === undefined
      ? {}
      : { expectedPendingAttemptId: pendingAttemptId }),
    outputs: run.outputs,
    revisedPosition,
    subject: {
      attemptNumber: attempt.attemptNumber,
      kind: transformation.kind,
      lessonSlug: head.adaptation.lessonSlug,
    },
  });
}

export async function executeDismissTransformations(
  jobId: string,
  dependencies: WorksheetScaffoldingJobDependencies = defaultDependencies,
): Promise<void> {
  const job = await dependencies.readJob(jobId);
  if (job?.kind !== dismissTransformationsJob.kind) {
    throw new Error("The dismissal job does not exist or has the wrong kind.");
  }
  const input = dismissTransformationsJob.input.parse(job.input);
  await executeAcceptedDocumentOperation({
    adaptationId: input.adaptationId,
    expectedHeadId: input.resourceDocumentId,
    idempotencyKey: job.idempotencyKey,
    jobId,
    kind: DISMISSAL_OPERATION_KIND,
    operationName: "The dismissal",
    repository: dependencies.repository,
    revise: (document) => dismissTransformationsAt(document, input.targetBlockId),
    targetBlockId: input.targetBlockId,
    validate: (document) => {
      if (
        input.targetBlockId !== null &&
        getResourceNodeById(document, input.targetBlockId) === undefined
      ) {
        throw new Error("The dismissal target is not present in this document.");
      }
    },
  });
}
