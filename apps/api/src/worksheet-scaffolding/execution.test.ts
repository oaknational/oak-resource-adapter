import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  executeApplySuggestion,
  executeGenerateSuggestions,
  executeRemoveTransformation,
  executeRetryTransformation,
  executeDismissTransformations,
  type WorksheetScaffoldingJobDependencies,
  type WorksheetScaffoldingExecutionRepository,
} from "./execution";
import {
  ADAPTATION_ID,
  ATTEMPT_ID,
  DOCUMENT_ID,
  JOB_ID,
  NEXT_DOCUMENT_ID,
  SUGGESTION_ID,
  TRANSFORMATION_ID,
  applyJob,
  acceptedSuggestion,
  generateJob,
  head,
  loadWorksheet,
  pendingReview,
  repositoryDefaults,
  retryJob,
  removeJob,
  dismissJob,
} from "./test-doubles";
import {
  dismissedTargetIds,
  documentDismissesTransformations,
} from "../transformations/dismissal";
import {
  CONTRIBUTION_EXTENSION_KEY,
  type ResourceDocument,
} from "@oaknational/resource-document";

beforeAll(loadWorksheet);

function stubRepository(
  overrides: Partial<WorksheetScaffoldingExecutionRepository> = {},
): WorksheetScaffoldingExecutionRepository {
  const doubles = Object.fromEntries(
    Object.entries(repositoryDefaults()).map(([name, result]) => [
      name,
      vi.fn().mockResolvedValue(result),
    ]),
  );
  return {
    ...doubles,
    ...overrides,
  } as unknown as WorksheetScaffoldingExecutionRepository;
}

function stubDependencies(
  overrides: Partial<WorksheetScaffoldingJobDependencies> = {},
): WorksheetScaffoldingJobDependencies {
  return {
    createInvoker: vi.fn(),
    executeTransformation: vi.fn(),
    generate: vi.fn().mockResolvedValue([]),
    readJob: vi.fn(),
    repository: stubRepository(),
    ...overrides,
  } as unknown as WorksheetScaffoldingJobDependencies;
}

describe("generating suggestions", () => {
  it("refuses a job of the wrong kind", async () => {
    const dependencies = stubDependencies({
      readJob: vi.fn().mockResolvedValue(applyJob()),
    });

    await expect(executeGenerateSuggestions(JOB_ID, dependencies)).rejects.toThrow(
      "wrong kind",
    );
  });

  it("refuses to generate against a document that is no longer the head", async () => {
    const dependencies = stubDependencies({
      readJob: vi.fn().mockResolvedValue(generateJob()),
      repository: stubRepository({
        getAdaptationHead: vi.fn().mockResolvedValue(head(NEXT_DOCUMENT_ID)),
      }),
    });

    await expect(executeGenerateSuggestions(JOB_ID, dependencies)).rejects.toThrow(
      "no longer targets the adaptation head",
    );
  });

  it("reuses the attempt a previous run created for this job", async () => {
    const repository = stubRepository({
      getAttemptForJob: vi.fn().mockResolvedValue({ id: ATTEMPT_ID }),
    });
    const dependencies = stubDependencies({
      readJob: vi.fn().mockResolvedValue(generateJob()),
      repository,
    });

    await executeGenerateSuggestions(JOB_ID, dependencies);

    expect(repository.createOperationAttempt).not.toHaveBeenCalled();
  });

  it("does not invoke the model again once a result is stored", async () => {
    const repository = stubRepository({
      getAttemptForJob: vi.fn().mockResolvedValue({ id: ATTEMPT_ID }),
      isAttemptComplete: vi.fn().mockResolvedValue(true),
    });
    const dependencies = stubDependencies({
      readJob: vi.fn().mockResolvedValue(generateJob()),
      repository,
    });

    await executeGenerateSuggestions(JOB_ID, dependencies);

    expect(dependencies.generate).not.toHaveBeenCalled();
    expect(repository.completeSuggestionAttempt).not.toHaveBeenCalled();
  });

  it("stores what the flow returned against the document it reviewed", async () => {
    const suggestions = [
      {
        kind: "scaffold-add-word-bank",
        label: "Add a word bank",
        params: { supportLevel: "low" },
        reason: "This question depends on recalling several topic words.",
        targetBlockId: null,
      },
    ];
    const repository = stubRepository();
    const dependencies = stubDependencies({
      generate: vi.fn().mockResolvedValue(suggestions),
      readJob: vi.fn().mockResolvedValue(generateJob()),
      repository,
    });

    await executeGenerateSuggestions(JOB_ID, dependencies);

    expect(repository.completeSuggestionAttempt).toHaveBeenCalledWith({
      attemptId: ATTEMPT_ID,
      resourceDocumentId: DOCUMENT_ID,
      suggestions,
    });
  });

  it("stores an empty result so a retry does not invoke the model again", async () => {
    const repository = stubRepository();
    const dependencies = stubDependencies({
      generate: vi.fn().mockResolvedValue([]),
      readJob: vi.fn().mockResolvedValue(generateJob()),
      repository,
    });

    await executeGenerateSuggestions(JOB_ID, dependencies);

    expect(repository.completeSuggestionAttempt).toHaveBeenCalledWith({
      attemptId: ATTEMPT_ID,
      resourceDocumentId: DOCUMENT_ID,
      suggestions: [],
    });
  });
});

describe("applying an accepted suggestion", () => {
  const appliedRun = {
    run: {
      outcome: "APPLIED",
      outputs: [{ document: undefined, purpose: "revised-resource" }],
    },
  };

  it("refuses a job of the wrong kind", async () => {
    const dependencies = stubDependencies({
      readJob: vi.fn().mockResolvedValue(generateJob()),
    });

    await expect(executeApplySuggestion(JOB_ID, dependencies)).rejects.toThrow(
      "wrong kind",
    );
  });

  it("runs the transformation and advances the head", async () => {
    const repository = stubRepository();
    const dependencies = stubDependencies({
      executeTransformation: vi.fn().mockResolvedValue(appliedRun),
      readJob: vi.fn().mockResolvedValue(applyJob()),
      repository,
    });

    await executeApplySuggestion(JOB_ID, dependencies);

    expect(repository.acceptSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: `apply:${SUGGESTION_ID}` }),
    );
    expect(repository.storeOutputsAndAdvanceHead).toHaveBeenCalledWith(
      expect.objectContaining({ expectedHeadId: DOCUMENT_ID, revisedPosition: 0 }),
    );
  });

  it("fails the job when the transformation does not apply", async () => {
    const dependencies = stubDependencies({
      executeTransformation: vi
        .fn()
        .mockResolvedValue({ run: { outcome: "UNUSABLE", reason: "REFUSAL" } }),
      readJob: vi.fn().mockResolvedValue(applyJob()),
    });

    await expect(executeApplySuggestion(JOB_ID, dependencies)).rejects.toThrow(
      "ended with UNUSABLE",
    );
  });

  it("does not rerun a transformation that already produced its revision", async () => {
    const repository = stubRepository({
      isAttemptComplete: vi.fn().mockResolvedValue(true),
      getAcceptedSuggestion: vi.fn().mockResolvedValue(acceptedSuggestion()),
    });
    const dependencies = stubDependencies({
      readJob: vi.fn().mockResolvedValue(applyJob()),
      repository,
    });

    await executeApplySuggestion(JOB_ID, dependencies);

    expect(dependencies.executeTransformation).not.toHaveBeenCalled();
    expect(repository.storeOutputsAndAdvanceHead).not.toHaveBeenCalled();
  });

  it("refuses an execution belonging to a different adaptation", async () => {
    const repository = stubRepository({
      getAcceptedSuggestion: vi.fn().mockResolvedValue(
        acceptedSuggestion({
          transformation: {
            adaptationId: "99999999-9999-4999-8999-999999999999",
            id: TRANSFORMATION_ID,
            kind: "scaffold-add-word-bank",
            params: { supportLevel: "low" },
            targetBlockId: null,
          },
        }),
      ),
    });
    const dependencies = stubDependencies({
      readJob: vi.fn().mockResolvedValue(applyJob()),
      repository,
    });

    await expect(executeApplySuggestion(JOB_ID, dependencies)).rejects.toThrow(
      "does not match this application job",
    );
  });
});

describe("retrying an applied scaffold", () => {
  const retriedRun = {
    run: {
      outcome: "APPLIED",
      outputs: [{ document: undefined, purpose: "revised-resource" }],
    },
  };

  it("reruns the same transformation against its primary input", async () => {
    const repository = stubRepository({
      getPendingReview: vi.fn().mockResolvedValue(pendingReview()),
    });
    const dependencies = stubDependencies({
      executeTransformation: vi.fn().mockResolvedValue(retriedRun),
      readJob: vi.fn().mockResolvedValue(retryJob()),
      repository,
    });

    await executeRetryTransformation(JOB_ID, dependencies);

    expect(repository.createRetryAttempt).toHaveBeenCalledWith({
      jobId: JOB_ID,
      transformationId: TRANSFORMATION_ID,
    });
    expect(dependencies.executeTransformation).toHaveBeenCalledWith(
      expect.objectContaining({
        contributionId: TRANSFORMATION_ID,
        kind: "scaffold-add-word-bank",
        params: { supportLevel: "low" },
      }),
      expect.any(Object),
    );
    expect(repository.storeOutputsAndAdvanceHead).toHaveBeenCalledWith(
      expect.objectContaining({
        adaptationId: ADAPTATION_ID,
        attemptId: ATTEMPT_ID,
        expectedHeadId: DOCUMENT_ID,
        expectedPendingAttemptId: ATTEMPT_ID,
      }),
    );
  });

  it("refuses a retry after its result stops being the current pending head", async () => {
    const dependencies = stubDependencies({
      readJob: vi.fn().mockResolvedValue(retryJob()),
    });

    await expect(executeRetryTransformation(JOB_ID, dependencies)).rejects.toThrow(
      "no longer targets a pending transformation",
    );
    expect(dependencies.executeTransformation).not.toHaveBeenCalled();
  });
});

async function contributed(): Promise<ResourceDocument> {
  const source = await loadWorksheet();
  return {
    ...source,
    content: [
      ...source.content,
      {
        id: "added-support",
        type: "paragraph" as const,
        content: [{ type: "text" as const, text: "Added support" }],
        extensions: { [CONTRIBUTION_EXTENSION_KEY]: TRANSFORMATION_ID },
      },
    ],
  } satisfies ResourceDocument;
}

describe("removing an accepted scaffold", () => {
  it("stores an approved revision without the contribution", async () => {
    const repository = stubRepository({
      getAdaptationHead: vi
        .fn()
        .mockResolvedValue(head(DOCUMENT_ID, await contributed())),
    });
    const dependencies = stubDependencies({
      readJob: vi.fn().mockResolvedValue(removeJob()),
      repository,
    });

    await executeRemoveTransformation(JOB_ID, dependencies);

    expect(repository.createOperationAttempt).toHaveBeenCalledWith({
      adaptationId: ADAPTATION_ID,
      idempotencyKey: `remove:${DOCUMENT_ID}:${TRANSFORMATION_ID}`,
      jobId: JOB_ID,
      kind: "transformations.remove",
      resourceDocumentId: DOCUMENT_ID,
    });
    expect(repository.storeOutputsAndAdvanceHead).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedHeadId: DOCUMENT_ID,
        review: "accepted",
        outputs: [
          expect.objectContaining({
            document: expect.objectContaining({
              content: (await loadWorksheet()).content,
            }),
          }),
        ],
      }),
    );
  });
});

describe("dismissing transformations", () => {
  it("stores an approved revision with the invisible target marker", async () => {
    const currentDocument = await loadWorksheet();
    const question = currentDocument.content.find((node) => node.type === "question");
    if (question === undefined) {
      throw new Error("The worksheet fixture needs a question.");
    }
    const repository = stubRepository();
    const dependencies = stubDependencies({
      readJob: vi.fn().mockResolvedValue(dismissJob(question.id)),
      repository,
    });

    await executeDismissTransformations(JOB_ID, dependencies);

    expect(repository.createOperationAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceDocumentId: DOCUMENT_ID,
        targetBlockId: question.id,
      }),
    );
    expect(repository.storeOutputsAndAdvanceHead).toHaveBeenCalledWith(
      expect.objectContaining({ expectedHeadId: DOCUMENT_ID, review: "accepted" }),
    );
    const stored = vi.mocked(repository.storeOutputsAndAdvanceHead).mock.calls[0]?.[0];
    const revisedDocument = stored?.outputs[0]?.document;
    if (revisedDocument === undefined) {
      throw new Error("Expected the dismissal to store a revised document.");
    }
    expect(dismissedTargetIds(revisedDocument)).toContain(question.id);
  });
});

describe("redelivered operation jobs", () => {
  it.each([
    ["removal", "executeRemoveTransformation"],
    ["dismissal", "executeDismissTransformations"],
  ] as const)(
    "leaves the head alone when the %s attempt already finished",
    async () => {
      const repository = stubRepository({
        getAdaptationHead: vi.fn().mockResolvedValue(head(NEXT_DOCUMENT_ID)),
        getAttemptForJob: vi.fn().mockResolvedValue({ id: ATTEMPT_ID }),
        isAttemptComplete: vi.fn().mockResolvedValue(true),
      });

      await executeRemoveTransformation(
        JOB_ID,
        stubDependencies({
          readJob: vi.fn().mockResolvedValue(removeJob()),
          repository,
        }),
      );
      await executeDismissTransformations(
        JOB_ID,
        stubDependencies({
          readJob: vi.fn().mockResolvedValue(dismissJob(null)),
          repository,
        }),
      );

      expect(repository.storeOutputsAndAdvanceHead).not.toHaveBeenCalled();
      expect(repository.getAdaptationHead).not.toHaveBeenCalled();
    },
  );

  it("refuses a retry whose attempt already finished", async () => {
    const repository = stubRepository({
      getAdaptationHead: vi.fn().mockResolvedValue(head(NEXT_DOCUMENT_ID)),
      getAttemptForJob: vi.fn().mockResolvedValue({ id: ATTEMPT_ID }),
      isAttemptComplete: vi.fn().mockResolvedValue(true),
    });
    const dependencies = stubDependencies({
      readJob: vi.fn().mockResolvedValue(retryJob()),
      repository,
    });

    await executeRetryTransformation(JOB_ID, dependencies);

    expect(dependencies.executeTransformation).not.toHaveBeenCalled();
    expect(repository.storeOutputsAndAdvanceHead).not.toHaveBeenCalled();
    expect(repository.getAdaptationHead).not.toHaveBeenCalled();
  });
});

describe("operation jobs that no longer apply", () => {
  it.each([
    ["removal", () => removeJob(), executeRemoveTransformation],
    ["dismissal", () => dismissJob(null), executeDismissTransformations],
  ] as const)("refuses %s while a review is pending", async (_, job, execute) => {
    const dependencies = stubDependencies({
      readJob: vi.fn().mockResolvedValue(job()),
      repository: stubRepository({
        getAdaptationHead: vi
          .fn()
          .mockResolvedValue(head(DOCUMENT_ID, await contributed())),
        getPendingReview: vi.fn().mockResolvedValue(pendingReview()),
      }),
    });

    await expect(execute(JOB_ID, dependencies)).rejects.toThrow(
      "cannot run while a review is pending",
    );
    expect(dependencies.repository.createOperationAttempt).not.toHaveBeenCalled();
  });

  it.each([
    ["removal", () => removeJob(), executeRemoveTransformation],
    ["retry", () => retryJob(), executeRetryTransformation],
    ["dismissal", () => dismissJob(null), executeDismissTransformations],
  ] as const)("refuses a %s once the head has moved on", async (_, job, execute) => {
    const dependencies = stubDependencies({
      readJob: vi.fn().mockResolvedValue(job()),
      repository: stubRepository({
        getAdaptationHead: vi.fn().mockResolvedValue(head(NEXT_DOCUMENT_ID)),
      }),
    });

    await expect(execute(JOB_ID, dependencies)).rejects.toThrow(
      "no longer targets the adaptation head",
    );
  });

  it.each([
    [
      "removal",
      () => removeJob({ kind: "suggestions.generate" }),
      executeRemoveTransformation,
    ],
    [
      "retry",
      () => retryJob({ kind: "suggestions.generate" }),
      executeRetryTransformation,
    ],
    [
      "dismissal",
      () => dismissJob(null, { kind: "suggestions.generate" }),
      executeDismissTransformations,
    ],
  ] as const)("refuses a %s job of the wrong kind", async (_, job, execute) => {
    const dependencies = stubDependencies({
      readJob: vi.fn().mockResolvedValue(job()),
    });

    await expect(execute(JOB_ID, dependencies)).rejects.toThrow("wrong kind");
  });

  it("refuses to remove a contribution the teacher never accepted", async () => {
    const dependencies = stubDependencies({
      readJob: vi.fn().mockResolvedValue(removeJob()),
      repository: stubRepository({
        getAdaptationHead: vi
          .fn()
          .mockResolvedValue(head(DOCUMENT_ID, await contributed())),
        isAcceptedContribution: vi.fn().mockResolvedValue(false),
      }),
    });

    await expect(executeRemoveTransformation(JOB_ID, dependencies)).rejects.toThrow(
      "not accepted on this document",
    );
  });

  it("refuses to remove a contribution that is not in the document", async () => {
    const dependencies = stubDependencies({
      readJob: vi.fn().mockResolvedValue(removeJob()),
    });

    await expect(executeRemoveTransformation(JOB_ID, dependencies)).rejects.toThrow(
      "not accepted on this document",
    );
  });

  it("refuses a retry whose transformation input has gone", async () => {
    const dependencies = stubDependencies({
      readJob: vi.fn().mockResolvedValue(retryJob()),
      repository: stubRepository({
        getPendingReview: vi.fn().mockResolvedValue(pendingReview()),
        getPrimaryTransformationInput: vi.fn().mockResolvedValue(null),
      }),
    });

    await expect(executeRetryTransformation(JOB_ID, dependencies)).rejects.toThrow(
      "input for the retry is missing",
    );
  });

  it("refuses a retry the model could not apply", async () => {
    const dependencies = stubDependencies({
      executeTransformation: vi
        .fn()
        .mockResolvedValue({ run: { outcome: "UNUSABLE", outputs: [] } }),
      readJob: vi.fn().mockResolvedValue(retryJob()),
      repository: stubRepository({
        getPendingReview: vi.fn().mockResolvedValue(pendingReview()),
      }),
    });

    await expect(executeRetryTransformation(JOB_ID, dependencies)).rejects.toThrow(
      "ended with UNUSABLE",
    );
  });
});

describe("dismissing the whole document", () => {
  it("marks the document rather than a block when no target is named", async () => {
    const repository = stubRepository();
    const dependencies = stubDependencies({
      readJob: vi.fn().mockResolvedValue(dismissJob(null)),
      repository,
    });

    await executeDismissTransformations(JOB_ID, dependencies);

    const stored = vi.mocked(repository.storeOutputsAndAdvanceHead).mock.calls[0]?.[0];
    const revised = stored?.outputs[0]?.document;
    if (revised === undefined) {
      throw new Error("Expected the dismissal to store a revised document.");
    }
    expect(documentDismissesTransformations(revised)).toBe(true);
    expect(dismissedTargetIds(revised).size).toBe(0);
  });
});

describe("the adaptation the job belongs to", () => {
  it("is required before a suggestion can be accepted", async () => {
    const dependencies = stubDependencies({
      readJob: vi.fn().mockResolvedValue(applyJob()),
      repository: stubRepository({
        getAdaptationHead: vi.fn().mockResolvedValue(null),
      }),
    });

    await expect(executeApplySuggestion(JOB_ID, dependencies)).rejects.toThrow(
      "adaptation does not exist",
    );
  });

  it("must still offer the suggestion the job names", async () => {
    const dependencies = stubDependencies({
      readJob: vi.fn().mockResolvedValue(applyJob()),
      repository: stubRepository({
        getOpenSuggestion: vi.fn().mockResolvedValue(null),
      }),
    });

    await expect(executeApplySuggestion(JOB_ID, dependencies)).rejects.toThrow(
      "unavailable or has an unknown transformation",
    );
  });

  it("names the adaptation the generate job targets", async () => {
    const repository = stubRepository();
    const dependencies = stubDependencies({
      readJob: vi.fn().mockResolvedValue(generateJob()),
      repository,
    });

    await executeGenerateSuggestions(JOB_ID, dependencies);

    expect(repository.getAdaptationHead).toHaveBeenCalledWith(ADAPTATION_ID);
  });
});
