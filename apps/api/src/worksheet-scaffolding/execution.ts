import {
  contributionIdsInDocument,
  getResourceNodeById,
  type ResourceDocument,
} from "@oaknational/resource-document";
import { parseResourceDocument } from "@oaknational/resource-document/parse";

import { createApplicationModelInvoker } from "../ai/application-invoker";
import { getJob } from "../jobs/job-repository";
import { applySuggestionJob } from "../jobs/suggestions/apply-definition";
import { generateSuggestionsJob } from "../jobs/suggestions/generate-definition";
import { removeTransformationJob } from "../jobs/transformations/remove-definition";
import { retryTransformationJob } from "../jobs/transformations/retry-definition";
import { dismissTransformationsJob } from "../jobs/transformations/dismiss-definition";
import { suggestionFlowDefinitions } from "../suggestions/registry";
import { generateSuggestions } from "../suggestions/service";
import { resolveApplicationMaterial } from "../transformations/application-material-resolver";
import { executeRegisteredTransformation } from "../transformations/application-service";
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
import * as scaffoldingRepository from "./repository";
import { asParams } from "./repository";

const REVISED_RESOURCE = "revised-resource";

/**
 * Running a job must not reach the job enqueuer: the workflow that dispatches
 * these steps is what the enqueuer starts, so an import back would tie the two
 * together. Follow-up generation is requested when the state is next read.
 */
export type WorksheetScaffoldingJobDependencies = {
  createInvoker: (
    transformationAttemptId: string,
  ) => ReturnType<typeof createApplicationModelInvoker>;
  executeTransformation: typeof executeRegisteredTransformation;
  generate: typeof generateSuggestions;
  readJob: typeof getJob;
  repository: WorksheetScaffoldingExecutionRepository;
};

export type WorksheetScaffoldingExecutionRepository = Pick<
  typeof scaffoldingRepository,
  | "acceptSuggestion"
  | "createOperationAttempt"
  | "createRetryAttempt"
  | "getAcceptedSuggestion"
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
>;

const defaultDependencies: WorksheetScaffoldingJobDependencies = {
  createInvoker: createApplicationModelInvoker,
  executeTransformation: executeRegisteredTransformation,
  generate: generateSuggestions,
  readJob: getJob,
  repository: scaffoldingRepository,
};

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

  const attempt =
    (await repository.getAttemptForJob(jobId)) ??
    (await repository.createOperationAttempt({
      adaptationId: input.adaptationId,
      idempotencyKey: suggestionOperationKey(input.resourceDocumentId),
      jobId,
      kind: SUGGESTION_OPERATION_KIND,
      resourceDocumentId: input.resourceDocumentId,
    }));

  if (await repository.isAttemptComplete(attempt.id)) {
    return;
  }

  const document = parseResourceDocument(head.storedDocument.document);
  const suggestions = await dependencies.generate(
    suggestionFlowDefinitions[input.flowId],
    document,
    await appliedTransformationHistory(input.adaptationId, document, repository),
    {
      correlationKey: jobId,
      invoker: dependencies.createInvoker(attempt.id),
    },
  );

  await repository.completeSuggestionAttempt({
    attemptId: attempt.id,
    resourceDocumentId: input.resourceDocumentId,
    suggestions,
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
      document: parseResourceDocument(sourceDocument.document),
      kind: transformation.kind,
      lesson:
        adaptation.lessonSlug === null || adaptation.programmeSlug === null
          ? undefined
          : {
              lessonSlug: adaptation.lessonSlug,
              programmeSlug: adaptation.programmeSlug,
            },
      params,
      targetBlockId: transformation.targetBlockId ?? undefined,
    },
    {
      createInvoker: () => dependencies.createInvoker(attempt.id),
      resolveMaterial: resolveApplicationMaterial,
    },
  );
  if (run.outcome !== "APPLIED") {
    throw new Error(`The accepted transformation ended with ${run.outcome}.`);
  }

  await repository.storeOutputsAndAdvanceHead({
    adaptationId: input.adaptationId,
    attemptId: attempt.id,
    expectedHeadId: sourceDocument.id,
    outputs: run.outputs,
    revisedPosition,
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
  const pending = await repository.getPendingReview(head.storedDocument.id);
  if (
    pending?.attempt.id !== input.attemptId ||
    !isRegisteredTransformationKind(pending.transformation.kind)
  ) {
    throw new Error("The retry no longer targets a pending transformation.");
  }

  const attempt =
    existingAttempt ??
    (await repository.createRetryAttempt({
      jobId,
      transformationId: pending.transformation.id,
    }));
  const sourceDocument = await repository.getPrimaryTransformationInput(
    pending.transformation.id,
  );
  if (sourceDocument === null) {
    throw new Error("The transformation input for the retry is missing.");
  }

  const params = transformationDefinitions[pending.transformation.kind].params.parse(
    asParams(pending.transformation.params),
  );
  const revisedPosition = revisedOutputPosition(pending.transformation.kind);
  const { run } = await dependencies.executeTransformation(
    {
      contributionId: pending.transformation.id,
      document: parseResourceDocument(sourceDocument.document),
      kind: pending.transformation.kind,
      lesson:
        head.adaptation.lessonSlug === null || head.adaptation.programmeSlug === null
          ? undefined
          : {
              lessonSlug: head.adaptation.lessonSlug,
              programmeSlug: head.adaptation.programmeSlug,
            },
      params,
      targetBlockId: pending.transformation.targetBlockId ?? undefined,
    },
    {
      createInvoker: () => dependencies.createInvoker(attempt.id),
      resolveMaterial: resolveApplicationMaterial,
    },
  );
  if (run.outcome !== "APPLIED") {
    throw new Error(`The retried transformation ended with ${run.outcome}.`);
  }

  await repository.storeOutputsAndAdvanceHead({
    adaptationId: input.adaptationId,
    attemptId: attempt.id,
    expectedHeadId: input.resourceDocumentId,
    expectedPendingAttemptId: input.attemptId,
    outputs: run.outputs,
    revisedPosition,
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
