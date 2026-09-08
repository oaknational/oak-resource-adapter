import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import type { Job } from "@oaknational/resource-adapter-db";
import type { ResourceDocument } from "@oaknational/resource-document";
import type {
  AcceptedSuggestion,
  PendingReview,
  StoredAdaptationHead,
  StoredAttempt,
  StoredSuggestion,
  StoredTransformation,
} from "./repository";
export const ADAPTATION_ID = "11111111-1111-4111-8111-111111111111";
export const DOCUMENT_ID = "22222222-2222-4222-8222-222222222222";
export const SUGGESTION_ID = "33333333-3333-4333-8333-333333333333";
export const NEXT_DOCUMENT_ID = "44444444-4444-4444-8444-444444444444";
export const ATTEMPT_ID = "55555555-5555-4555-8555-555555555555";
export const TRANSFORMATION_ID = "66666666-6666-4666-8666-666666666666";
export const JOB_ID = "77777777-7777-4777-8777-777777777777";
export const REQUEST_ID = "88888888-8888-4888-8888-888888888888";

const fixtureTimestamp = new Date("2026-02-03T09:00:00.000Z");

export const teacher = { organisationId: "org-1", teacherId: "teacher-1" } as const;

export const lessonReference = {
  lessonSlug: "adopting-different-perspectives",
  programmeSlug: "english-primary-ks2",
} as const;

export const lesson = {
  ...lessonReference,
  availableResources: ["worksheet"],
  keyStageSlug: "ks2",
  subjectSlug: "english",
  title: "Adopting different perspectives",
} as const;

let worksheet: ResourceDocument;

export async function loadWorksheet(): Promise<ResourceDocument> {
  worksheet = await originalResourceDocuments.get({
    ...lessonReference,
    resourceType: "worksheet",
    source: "oak",
  });
  return worksheet;
}

export function storedDocument(
  id: string,
  document: ResourceDocument = worksheet,
): StoredAdaptationHead["storedDocument"] {
  return {
    createdAt: fixtureTimestamp,
    document,
    id,
    origin: "generated",
    position: 0,
    retrievedAt: null,
    sourceId: null,
    sourceReference: null,
    transformationAttemptId: ATTEMPT_ID,
  };
}

export function head(
  documentId = DOCUMENT_ID,
  document: ResourceDocument = worksheet,
): StoredAdaptationHead {
  return {
    adaptation: {
      abandonedAt: null,
      capabilityId: "worksheetScaffolding",
      clerkUserId: teacher.teacherId,
      createdAt: fixtureTimestamp,
      headResourceDocumentId: documentId,
      id: ADAPTATION_ID,
      lessonSlug: lesson.lessonSlug,
      programmeSlug: lesson.programmeSlug,
      replacementRequestId: null,
      updatedAt: fixtureTimestamp,
    },
    storedDocument: storedDocument(documentId, document),
  };
}

export function storedSuggestion(
  overrides: Partial<StoredSuggestion> = {},
): StoredSuggestion {
  return {
    acceptedTransformationId: null,
    createdAt: fixtureTimestamp,
    id: SUGGESTION_ID,
    kind: "scaffold-add-word-bank",
    params: { supportLevel: "low" },
    position: 0,
    reason: "This question depends on recalling several topic words.",
    resourceDocumentId: DOCUMENT_ID,
    targetBlockId: null,
    transformationAttemptId: ATTEMPT_ID,
    undoCount: 0,
    ...overrides,
  };
}

type AcceptedSuggestionOverrides = Readonly<{
  adaptation?: Partial<AcceptedSuggestion["adaptation"]>;
  attempt?: Partial<AcceptedSuggestion["attempt"]>;
  sourceDocument?: Partial<AcceptedSuggestion["sourceDocument"]>;
  suggestion?: Partial<AcceptedSuggestion["suggestion"]>;
  transformation?: Partial<AcceptedSuggestion["transformation"]>;
}>;

function storedTransformation(
  overrides: Partial<StoredTransformation> = {},
): StoredTransformation {
  return {
    adaptationId: ADAPTATION_ID,
    createdAt: fixtureTimestamp,
    id: TRANSFORMATION_ID,
    idempotencyKey: `apply:${SUGGESTION_ID}`,
    kind: "scaffold-add-word-bank",
    params: { supportLevel: "low" },
    targetBlockId: null,
    updatedAt: fixtureTimestamp,
    ...overrides,
  };
}

export function acceptedSuggestion(
  overrides: AcceptedSuggestionOverrides = {},
): AcceptedSuggestion {
  const baseHead = head();
  return {
    adaptation: {
      ...baseHead.adaptation,
      ...overrides.adaptation,
    },
    attempt: {
      ...storedAttempt(),
      ...overrides.attempt,
    },
    sourceDocument: {
      ...storedDocument(DOCUMENT_ID),
      ...overrides.sourceDocument,
    },
    suggestion: {
      ...storedSuggestion({ acceptedTransformationId: TRANSFORMATION_ID }),
      ...overrides.suggestion,
    },
    transformation: storedTransformation(overrides.transformation),
  };
}

export function storedAttempt(overrides: Partial<StoredAttempt> = {}): StoredAttempt {
  return {
    acceptedAt: null,
    attemptNumber: 1,
    completedAt: null,
    createdAt: new Date("2026-02-03T09:00:00.000Z"),
    id: ATTEMPT_ID,
    jobId: JOB_ID,
    transformationId: TRANSFORMATION_ID,
    updatedAt: new Date("2026-02-03T09:00:00.000Z"),
    ...overrides,
  };
}

type PendingReviewOverrides = Readonly<{
  attempt?: Partial<PendingReview["attempt"]>;
  suggestion?: Partial<PendingReview["suggestion"]>;
  transformation?: Partial<PendingReview["transformation"]>;
}>;

export function pendingReview(overrides: PendingReviewOverrides = {}): PendingReview {
  return {
    attempt: {
      ...storedAttempt(),
      ...overrides.attempt,
    },
    suggestion: {
      ...storedSuggestion({ acceptedTransformationId: TRANSFORMATION_ID }),
      ...overrides.suggestion,
    },
    transformation: storedTransformation(overrides.transformation),
  };
}

function storedJob(
  kind: string,
  idempotencyKey: string,
  input: Job["input"],
  overrides: Partial<Job>,
): Job {
  const job: Job = {
    completedAt: null,
    concurrencyKey: `adaptation:${ADAPTATION_ID}:head:${DOCUMENT_ID}`,
    createdAt: fixtureTimestamp,
    failureCode: null,
    failureMessage: null,
    id: JOB_ID,
    idempotencyKey,
    input,
    kind,
    startedAt: null,
    status: "queued",
    updatedAt: fixtureTimestamp,
    workflowRunId: null,
  };
  return { ...job, ...overrides };
}

export function generateJob(overrides: Partial<Job> = {}): Job {
  return storedJob(
    "suggestions.generate",
    `suggest:${DOCUMENT_ID}`,
    {
      adaptationId: ADAPTATION_ID,
      flowId: "worksheet-scaffolding",
      resourceDocumentId: DOCUMENT_ID,
    },
    overrides,
  );
}

export function applyJob(overrides: Partial<Job> = {}): Job {
  return storedJob(
    "suggestions.apply",
    `apply:${SUGGESTION_ID}`,
    {
      adaptationId: ADAPTATION_ID,
      params: { supportLevel: "low" },
      resourceDocumentId: DOCUMENT_ID,
      suggestionId: SUGGESTION_ID,
    },
    overrides,
  );
}

export function retryJob(overrides: Partial<Job> = {}): Job {
  return storedJob(
    "transformations.retry",
    `retry:${ATTEMPT_ID}:${REQUEST_ID}`,
    {
      adaptationId: ADAPTATION_ID,
      attemptId: ATTEMPT_ID,
      requestId: REQUEST_ID,
      resourceDocumentId: DOCUMENT_ID,
    },
    overrides,
  );
}

export function removeJob(overrides: Partial<Job> = {}): Job {
  return storedJob(
    "transformations.remove",
    `remove:${DOCUMENT_ID}:${TRANSFORMATION_ID}`,
    {
      adaptationId: ADAPTATION_ID,
      contributionId: TRANSFORMATION_ID,
      resourceDocumentId: DOCUMENT_ID,
    },
    overrides,
  );
}

export function dismissJob(
  targetBlockId: string | null,
  overrides: Partial<Job> = {},
): Job {
  return storedJob(
    "transformations.dismiss",
    `dismiss:${DOCUMENT_ID}:${targetBlockId ?? "document"}`,
    {
      adaptationId: ADAPTATION_ID,
      resourceDocumentId: DOCUMENT_ID,
      targetBlockId,
    },
    overrides,
  );
}

type ScaffoldingRepository = typeof import("./repository");

type AsyncRepositoryFunction = (...args: never[]) => Promise<unknown>;

type RepositoryResults = {
  [
    K in keyof ScaffoldingRepository as ScaffoldingRepository[K] extends AsyncRepositoryFunction
      ? K
      : never
  ]: Awaited<ReturnType<Extract<ScaffoldingRepository[K], AsyncRepositoryFunction>>>;
};

/**
 * Default results per repository function. Typed so adding a repository function
 * without a default fails to compile. Test files wrap these in spies; this
 * module stays clear of the test runner so it is not a production module
 * reaching for a development dependency.
 */
export function repositoryDefaults(): RepositoryResults {
  return {
    acceptSuggestion: acceptedSuggestion(),
    createAdaptationWithSourceDocument: {
      adaptationId: ADAPTATION_ID,
      resourceDocumentId: DOCUMENT_ID,
    },
    replaceAdaptationWithSourceDocument: {
      adaptationId: ADAPTATION_ID,
      resourceDocumentId: DOCUMENT_ID,
    },
    acceptPendingReview: true,
    createOperationAttempt: storedAttempt(),
    createRetryAttempt: storedAttempt(),
    findResumableAdaptation: null,
    getAcceptedSuggestion: null,
    getAdaptationHead: head(),
    getAttemptForJob: null,
    getLatestJobForConcurrencyKey: null,
    getOpenSuggestion: storedSuggestion(),
    getPendingReview: null,
    getPrimaryTransformationInput: storedDocument(DOCUMENT_ID),
    isAcceptedContribution: true,
    isAttemptComplete: false,
    listAppliedTransformations: [],
    listOpenSuggestions: [],
    storeOutputsAndAdvanceHead: NEXT_DOCUMENT_ID,
    undoPendingReview: true,
    completeSuggestionAttempt: undefined,
  };
}
