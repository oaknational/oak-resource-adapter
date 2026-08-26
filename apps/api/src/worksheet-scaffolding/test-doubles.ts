import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import type { ResourceDocument } from "@oaknational/resource-document";
export const ADAPTATION_ID = "11111111-1111-4111-8111-111111111111";
export const DOCUMENT_ID = "22222222-2222-4222-8222-222222222222";
export const SUGGESTION_ID = "33333333-3333-4333-8333-333333333333";
export const NEXT_DOCUMENT_ID = "44444444-4444-4444-8444-444444444444";
export const ATTEMPT_ID = "55555555-5555-4555-8555-555555555555";
export const TRANSFORMATION_ID = "66666666-6666-4666-8666-666666666666";
export const JOB_ID = "77777777-7777-4777-8777-777777777777";

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

export function storedDocument(id: string) {
  return { document: worksheet, id } as never;
}

export function head(documentId = DOCUMENT_ID) {
  return {
    adaptation: {
      id: ADAPTATION_ID,
      lessonSlug: lesson.lessonSlug,
      programmeSlug: lesson.programmeSlug,
    },
    storedDocument: storedDocument(documentId),
  } as never;
}

export function storedSuggestion(overrides: Record<string, unknown> = {}) {
  return {
    acceptedTransformationId: null,
    id: SUGGESTION_ID,
    kind: "scaffold-add-word-bank",
    params: { supportLevel: "low" },
    position: 0,
    reason: "This question depends on recalling several topic words.",
    resourceDocumentId: DOCUMENT_ID,
    targetBlockId: null,
    transformationAttemptId: ATTEMPT_ID,
    ...overrides,
  } as never;
}

export function acceptedSuggestion(overrides: Record<string, unknown> = {}) {
  return {
    adaptation: {
      id: ADAPTATION_ID,
      lessonSlug: lesson.lessonSlug,
      programmeSlug: lesson.programmeSlug,
    },
    attempt: { id: ATTEMPT_ID },
    sourceDocument: storedDocument(DOCUMENT_ID),
    suggestion: storedSuggestion({ acceptedTransformationId: TRANSFORMATION_ID }),
    transformation: {
      adaptationId: ADAPTATION_ID,
      id: TRANSFORMATION_ID,
      kind: "scaffold-add-word-bank",
      params: { supportLevel: "low" },
      targetBlockId: null,
    },
    ...overrides,
  } as never;
}

export function generateJob(overrides: Record<string, unknown> = {}) {
  return {
    id: JOB_ID,
    idempotencyKey: `suggest:${DOCUMENT_ID}`,
    input: {
      adaptationId: ADAPTATION_ID,
      flowId: "worksheet-scaffolding",
      resourceDocumentId: DOCUMENT_ID,
    },
    kind: "suggestions.generate",
    ...overrides,
  } as never;
}

export function applyJob(overrides: Record<string, unknown> = {}) {
  return {
    id: JOB_ID,
    idempotencyKey: `apply:${SUGGESTION_ID}`,
    input: {
      adaptationId: ADAPTATION_ID,
      params: { supportLevel: "low" },
      resourceDocumentId: DOCUMENT_ID,
      suggestionId: SUGGESTION_ID,
    },
    kind: "suggestions.apply",
    ...overrides,
  } as never;
}

/**
 * Default results per repository function. Test files wrap these in spies; this
 * module stays clear of the test runner so it is not a production module
 * reaching for a development dependency.
 */
export function repositoryDefaults() {
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
    createOperationAttempt: { id: ATTEMPT_ID },
    findResumableAdaptation: null,
    getAcceptedSuggestion: null,
    getAdaptationHead: head(),
    getAttemptForJob: null,
    getLatestJobForConcurrencyKey: null,
    getOpenSuggestion: storedSuggestion(),
    isAttemptComplete: false,
    listAppliedTransformations: [],
    listOpenSuggestions: [],
    storeOutputsAndAdvanceHead: NEXT_DOCUMENT_ID,
    completeSuggestionAttempt: undefined,
  };
}
