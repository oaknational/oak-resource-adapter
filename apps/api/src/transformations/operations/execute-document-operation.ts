import type { ResourceDocument } from "@oaknational/resource-document";
import { parseResourceDocument } from "@oaknational/resource-document/parse";

import type { TransformationOutput } from "../types";

type OperationAttempt = Readonly<{ id: string }>;

export type DocumentOperationRepository = Readonly<{
  createOperationAttempt: (input: {
    adaptationId: string;
    idempotencyKey: string;
    jobId: string;
    kind: string;
    resourceDocumentId: string;
    targetBlockId?: string | null;
  }) => Promise<OperationAttempt>;
  getAdaptationHead: (
    adaptationId: string,
  ) => Promise<null | Readonly<{ storedDocument: { document: unknown; id: string } }>>;
  getAttemptForJob: (jobId: string) => Promise<null | OperationAttempt>;
  /** Only its presence matters here, so the capability's own row type stays private. */
  getPendingReview: (resourceDocumentId: string) => Promise<object | null>;
  isAttemptComplete: (attemptId: string) => Promise<boolean>;
  storeOutputsAndAdvanceHead: (input: {
    adaptationId: string;
    attemptId: string;
    expectedHeadId: string;
    outputs: readonly Readonly<{
      document: ResourceDocument;
      purpose: TransformationOutput;
    }>[];
    review: "accepted";
    revisedPosition: number;
  }) => Promise<string>;
}>;

/**
 * Runs a deterministic document revision the user has already approved.
 * Capability code supplies only eligibility checks and the revision itself.
 */
export async function executeAcceptedDocumentOperation(input: {
  adaptationId: string;
  expectedHeadId: string;
  idempotencyKey: string;
  jobId: string;
  kind: string;
  operationName: string;
  repository: DocumentOperationRepository;
  revise: (document: ResourceDocument) => ResourceDocument;
  targetBlockId?: string | null;
  validate?: (document: ResourceDocument) => Promise<void> | void;
}): Promise<void> {
  const existingAttempt = await input.repository.getAttemptForJob(input.jobId);
  if (
    existingAttempt !== null &&
    (await input.repository.isAttemptComplete(existingAttempt.id))
  ) {
    return;
  }

  const head = await input.repository.getAdaptationHead(input.adaptationId);
  if (head?.storedDocument.id !== input.expectedHeadId) {
    throw new Error(`${input.operationName} no longer targets the adaptation head.`);
  }
  if ((await input.repository.getPendingReview(input.expectedHeadId)) !== null) {
    throw new Error(`${input.operationName} cannot run while a review is pending.`);
  }

  const document = parseResourceDocument(head.storedDocument.document);
  await input.validate?.(document);
  const attempt =
    existingAttempt ??
    (await input.repository.createOperationAttempt({
      adaptationId: input.adaptationId,
      idempotencyKey: input.idempotencyKey,
      jobId: input.jobId,
      kind: input.kind,
      resourceDocumentId: input.expectedHeadId,
      ...(input.targetBlockId === undefined
        ? {}
        : { targetBlockId: input.targetBlockId }),
    }));

  await input.repository.storeOutputsAndAdvanceHead({
    adaptationId: input.adaptationId,
    attemptId: attempt.id,
    expectedHeadId: input.expectedHeadId,
    outputs: [
      {
        document: input.revise(document),
        purpose: "revised-resource",
      },
    ],
    review: "accepted",
    revisedPosition: 0,
  });
}
