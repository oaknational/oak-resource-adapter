import { parseResourceDocument } from "@oaknational/resource-document/parse";

import { createApplicationModelInvoker } from "../ai/application-invoker";
import { getJob } from "../jobs/job-repository";
import { applySuggestionJob } from "../jobs/suggestions/apply-definition";
import { generateSuggestionsJob } from "../jobs/suggestions/generate-definition";
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
import { SUGGESTION_OPERATION_KIND, suggestionOperationKey } from "./capability";
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
  | "getAcceptedSuggestion"
  | "getAdaptationHead"
  | "getAttemptForJob"
  | "getOpenSuggestion"
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

function revisedOutputPosition(kind: RegisteredTransformationKind): number {
  const position = transformationDefinitions[kind].outputs.indexOf(REVISED_RESOURCE);
  if (position < 0) {
    throw new Error(`${kind} does not produce a revised resource.`);
  }
  return position;
}

async function appliedTransformationHistory(
  adaptationId: string,
  repository: WorksheetScaffoldingJobDependencies["repository"],
): Promise<readonly AppliedTransformationSummary[]> {
  const rows = await repository.listAppliedTransformations(adaptationId);

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

  const suggestions = await dependencies.generate(
    suggestionFlowDefinitions[input.flowId],
    parseResourceDocument(head.storedDocument.document),
    await appliedTransformationHistory(input.adaptationId, repository),
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
