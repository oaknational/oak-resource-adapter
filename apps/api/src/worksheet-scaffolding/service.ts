import {
  worksheetScaffoldingJobKinds,
  type WorksheetScaffoldingApplyRequest,
  type WorksheetScaffoldingEntry,
  type WorksheetScaffoldingOpenRequest,
  type WorksheetScaffoldingJobKind,
  type WorksheetScaffoldingState,
} from "@oaknational/resource-adapter-contracts/internal";
import type { ResourceAdapterAuthenticatedTeacher } from "@oaknational/resource-adapter-contracts/server";
import { parseResourceDocument } from "@oaknational/resource-document/parse";
import { z } from "zod";

import { enqueueJob } from "../jobs/enqueue-job";
import type { JobJsonValue } from "../jobs/domain";
import { applySuggestionJob } from "../jobs/suggestions/apply-definition";
import { generateSuggestionsJob } from "../jobs/suggestions/generate-definition";
import { getSourceDocument } from "../source-documents/service";
import {
  isRegisteredTransformationKind,
  transformationDefinitions,
} from "../transformations/registry";
import {
  adaptationHeadConcurrencyKey,
  CAPABILITY,
  SUGGESTION_FLOW_ID,
  SUGGESTION_OPERATION_KIND,
  suggestionOperationKey,
} from "./capability";
import * as scaffoldingRepository from "./repository";
import { asParams } from "./repository";

/**
 * How long unfinished work stays on offer. Long enough to cover a teacher
 * returning to their planning the following week, short enough that last term's
 * half-finished worksheet does not reappear without explanation.
 */
const RESUMABLE_WINDOW_DAYS = 30;

export type WorksheetScaffoldingDependencies = {
  enqueue: typeof enqueueJob;
  resumableCutoff: (windowDays: number) => Date;
  readSourceDocument: typeof getSourceDocument;
  repository: WorksheetScaffoldingServiceRepository;
};

export type WorksheetScaffoldingServiceRepository = Pick<
  typeof scaffoldingRepository,
  | "createAdaptationWithSourceDocument"
  | "findResumableAdaptation"
  | "getAdaptationHead"
  | "getLatestJobForConcurrencyKey"
  | "getOpenSuggestion"
  | "listOpenSuggestions"
  | "replaceAdaptationWithSourceDocument"
>;

const defaultDependencies: WorksheetScaffoldingDependencies = {
  enqueue: enqueueJob,
  resumableCutoff: (windowDays) =>
    new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000),
  readSourceDocument: getSourceDocument,
  repository: scaffoldingRepository,
};

/** The job input is stored as JSON, so validated params are narrowed to it. */
function asJobParams(value: unknown): Record<string, JobJsonValue> {
  return z.record(z.string(), z.json()).parse(value);
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

/** A suggestion is accepted once, so its identifier is the whole of the key. */
function applicationIdempotencyKey(suggestionId: string): string {
  return `apply:${suggestionId}`;
}

type LoadedAdaptation = Readonly<{
  headResourceDocumentId: string;
  state: WorksheetScaffoldingState;
}>;

async function readAdaptation(
  adaptationId: string,
  teacherId: string | undefined,
  repository: WorksheetScaffoldingDependencies["repository"],
): Promise<LoadedAdaptation | null> {
  const head = await repository.getAdaptationHead(adaptationId, teacherId);
  if (head === null) {
    return null;
  }

  const [rows, job] = await Promise.all([
    repository.listOpenSuggestions(head.storedDocument.id),
    repository.getLatestJobForConcurrencyKey(
      adaptationHeadConcurrencyKey(adaptationId, head.storedDocument.id),
      worksheetScaffoldingJobKinds,
    ),
  ]);

  return {
    headResourceDocumentId: head.storedDocument.id,
    state: {
      adaptationId,
      document: parseResourceDocument(head.storedDocument.document),
      job:
        job === null || !isSuggestionJobKind(job.kind)
          ? null
          : {
              failureMessage: job.failureMessage,
              id: job.id,
              kind: job.kind,
              status: job.status,
            },
      suggestions: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        label: isRegisteredTransformationKind(row.kind)
          ? transformationDefinitions[row.kind].label
          : row.kind,
        params: asParams(row.params),
        reason: row.reason,
        targetBlockId: row.targetBlockId,
      })),
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
  return (
    state.job === null ||
    (state.job.kind === "suggestions.apply" && state.job.status === "succeeded")
  );
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
  const { repository } = dependencies;
  const read = await readAdaptation(adaptationId, teacherId, repository);
  if (read === null || !needsSuggestions(read.state)) {
    return read?.state ?? null;
  }

  await dependencies.enqueue(
    generationRequest(adaptationId, read.headResourceDocumentId),
  );
  const refreshed = await readAdaptation(adaptationId, teacherId, repository);
  return refreshed?.state ?? read.state;
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
      operationKind: SUGGESTION_OPERATION_KIND,
      teacherId: target.teacherId,
    });
    if (resumable !== null) {
      return {
        outcome: "resumable",
        resumable: {
          adaptationId: resumable.id,
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
          replacingAdaptationId: replacing,
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
  const params = transformationDefinitions[suggestion.kind].params.parse(
    input.params ?? suggestion.params,
  );

  await dependencies.enqueue({
    concurrencyKey: adaptationHeadConcurrencyKey(
      input.adaptationId,
      head.storedDocument.id,
    ),
    idempotencyKey: applicationIdempotencyKey(input.suggestionId),
    input: {
      adaptationId: input.adaptationId,
      params: asJobParams(params),
      resourceDocumentId: head.storedDocument.id,
      suggestionId: input.suggestionId,
    },
    kind: applySuggestionJob.kind,
  });

  const read = await readAdaptation(input.adaptationId, target.teacherId, repository);
  return read?.state ?? null;
}
