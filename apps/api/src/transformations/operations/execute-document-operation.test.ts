import type { ResourceDocument } from "@oaknational/resource-document";
import { describe, expect, it, vi } from "vitest";

import {
  executeAcceptedDocumentOperation,
  type DocumentOperationRepository,
} from "./execute-document-operation";

const ADAPTATION_ID = "adaptation-1";
const HEAD_ID = "document-1";
const JOB_ID = "job-1";
const ATTEMPT_ID = "attempt-1";

const document: ResourceDocument = {
  answers: [],
  assets: [],
  content: [
    { content: [{ text: "Keep", type: "text" }], id: "original", type: "paragraph" },
  ],
  diagnostics: [],
  id: "operation-test",
  language: "en-GB",
  metadata: { title: "Operation test" },
  profile: "worksheet.v0",
  provenance: {
    producer: { name: "test", version: "1" },
    source: { id: "operation-test", system: "test" },
  },
  schemaVersion: "0.1",
};

function stubRepository(
  overrides: Partial<DocumentOperationRepository> = {},
): DocumentOperationRepository {
  return {
    createOperationAttempt: vi.fn().mockResolvedValue({ id: ATTEMPT_ID }),
    getAdaptationHead: vi
      .fn()
      .mockResolvedValue({ storedDocument: { document, id: HEAD_ID } }),
    getAttemptForJob: vi.fn().mockResolvedValue(null),
    getPendingReview: vi.fn().mockResolvedValue(null),
    isAttemptComplete: vi.fn().mockResolvedValue(false),
    storeOutputsAndAdvanceHead: vi.fn().mockResolvedValue("document-2"),
    ...overrides,
  };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    adaptationId: ADAPTATION_ID,
    expectedHeadId: HEAD_ID,
    idempotencyKey: "operation:1",
    jobId: JOB_ID,
    kind: "transformations.remove",
    operationName: "The removal",
    revise: (source: ResourceDocument) => ({ ...source, content: [] }),
    ...overrides,
  };
}

describe("executeAcceptedDocumentOperation", () => {
  it("stores the revision as already accepted, against the expected head", async () => {
    const repository = stubRepository();

    await executeAcceptedDocumentOperation({ ...request(), repository });

    expect(repository.storeOutputsAndAdvanceHead).toHaveBeenCalledWith({
      adaptationId: ADAPTATION_ID,
      attemptId: ATTEMPT_ID,
      expectedHeadId: HEAD_ID,
      outputs: [
        { document: { ...document, content: [] }, purpose: "revised-resource" },
      ],
      review: "accepted",
      revisedPosition: 0,
    });
  });

  it("records the operation against the document it revised", async () => {
    const repository = stubRepository();

    await executeAcceptedDocumentOperation({
      ...request({ targetBlockId: "question-1" }),
      repository,
    });

    expect(repository.createOperationAttempt).toHaveBeenCalledWith({
      adaptationId: ADAPTATION_ID,
      idempotencyKey: "operation:1",
      jobId: JOB_ID,
      kind: "transformations.remove",
      resourceDocumentId: HEAD_ID,
      targetBlockId: "question-1",
    });
  });

  it("leaves the target out entirely when the operation has none", async () => {
    const repository = stubRepository();

    await executeAcceptedDocumentOperation({ ...request(), repository });

    expect(repository.createOperationAttempt).toHaveBeenCalledWith(
      expect.not.objectContaining({ targetBlockId: expect.anything() }),
    );
  });

  it("does nothing when a redelivered job's attempt already finished", async () => {
    const repository = stubRepository({
      getAttemptForJob: vi.fn().mockResolvedValue({ id: ATTEMPT_ID }),
      isAttemptComplete: vi.fn().mockResolvedValue(true),
    });

    await executeAcceptedDocumentOperation({ ...request(), repository });

    expect(repository.getAdaptationHead).not.toHaveBeenCalled();
    expect(repository.storeOutputsAndAdvanceHead).not.toHaveBeenCalled();
  });

  it("reuses the attempt a redelivered job already created", async () => {
    const repository = stubRepository({
      getAttemptForJob: vi.fn().mockResolvedValue({ id: "earlier-attempt" }),
    });

    await executeAcceptedDocumentOperation({ ...request(), repository });

    expect(repository.createOperationAttempt).not.toHaveBeenCalled();
    expect(repository.storeOutputsAndAdvanceHead).toHaveBeenCalledWith(
      expect.objectContaining({ attemptId: "earlier-attempt" }),
    );
  });

  it("refuses to run once the head has moved on", async () => {
    const repository = stubRepository({
      getAdaptationHead: vi
        .fn()
        .mockResolvedValue({ storedDocument: { document, id: "document-9" } }),
    });

    await expect(
      executeAcceptedDocumentOperation({ ...request(), repository }),
    ).rejects.toThrow("The removal no longer targets the adaptation head.");
    expect(repository.storeOutputsAndAdvanceHead).not.toHaveBeenCalled();
  });

  it("refuses to run against an adaptation that has gone", async () => {
    const repository = stubRepository({
      getAdaptationHead: vi.fn().mockResolvedValue(null),
    });

    await expect(
      executeAcceptedDocumentOperation({ ...request(), repository }),
    ).rejects.toThrow("no longer targets the adaptation head");
  });

  it("refuses to revise a head that is still awaiting review", async () => {
    const repository = stubRepository({
      getPendingReview: vi.fn().mockResolvedValue({ attempt: { id: "other" } }),
    });

    await expect(
      executeAcceptedDocumentOperation({ ...request(), repository }),
    ).rejects.toThrow("The removal cannot run while a review is pending.");
    expect(repository.createOperationAttempt).not.toHaveBeenCalled();
  });

  it("checks eligibility before recording anything", async () => {
    const repository = stubRepository();

    await expect(
      executeAcceptedDocumentOperation({
        ...request({
          validate: () => {
            throw new Error("The contribution is not accepted on this document.");
          },
        }),
        repository,
      }),
    ).rejects.toThrow("The contribution is not accepted on this document.");
    expect(repository.createOperationAttempt).not.toHaveBeenCalled();
    expect(repository.storeOutputsAndAdvanceHead).not.toHaveBeenCalled();
  });

  it("passes the parsed head document to the revision", async () => {
    const repository = stubRepository();
    const revise = vi.fn().mockReturnValue(document);

    await executeAcceptedDocumentOperation({ ...request({ revise }), repository });

    expect(revise).toHaveBeenCalledWith(document);
  });
});
