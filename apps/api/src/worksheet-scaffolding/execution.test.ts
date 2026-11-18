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
  lessonReference,
  loadWorksheet,
  pendingReview,
  repositoryDefaults,
  retryJob,
  removeJob,
  dismissJob,
  storedAttempt,
  storedDocument,
  teacher,
} from "./test-doubles";
import {
  dismissedTargetIds,
  documentDismissesTransformations,
} from "../transformations/dismissal";
import {
  getResourceNodesByType,
  CONTRIBUTION_EXTENSION_KEY,
  type ResourceDocument,
} from "@oaknational/resource-document";
import type { ModerationOutcome } from "@oaknational/resource-adapter-moderation";

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
    createModerator: moderatorReturning({ outcome: "PASSED", scores: {} })
      .createModerator,
    executeTransformation: vi.fn(),
    generate: vi.fn().mockResolvedValue([]),
    readFacts: vi.fn().mockResolvedValue(null),
    readJob: vi.fn(),
    repository: stubRepository(),
    resolveMaterial: vi.fn().mockResolvedValue({ material: {}, warnings: [] }),
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

  it("creates a retry attempt on the existing suggestion operation", async () => {
    const repository = stubRepository({
      findSuggestionGeneration: vi.fn().mockResolvedValue({ id: TRANSFORMATION_ID }),
    });
    const dependencies = stubDependencies({
      readJob: vi.fn().mockResolvedValue(generateJob()),
      repository,
    });

    await executeGenerateSuggestions(JOB_ID, dependencies);

    expect(repository.createOperationAttempt).not.toHaveBeenCalled();
    expect(repository.createRetryAttempt).toHaveBeenCalledWith({
      jobId: JOB_ID,
      transformationId: TRANSFORMATION_ID,
    });
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

  it("gives the flow the material and facts of the adaptation's lesson", async () => {
    const material = {
      "lesson.keywords": {
        keywords: [{ description: "a point of view", keyword: "perspective" }],
        kind: "keywords",
      },
    } as const;
    const facts = {
      restrictionLevels: null,
      subjectSlugs: ["english"],
      legacy: false,
      contentGuidance: ["Depiction or discussion of serious crime"],
    };
    const dependencies = stubDependencies({
      readFacts: vi.fn().mockResolvedValue(facts),
      readJob: vi.fn().mockResolvedValue(generateJob()),
      resolveMaterial: vi.fn().mockResolvedValue({ material, warnings: [] }),
    });

    await executeGenerateSuggestions(JOB_ID, dependencies);

    expect(dependencies.resolveMaterial).toHaveBeenCalledWith(
      expect.arrayContaining([{ key: "lesson.keywords", required: false }]),
      lessonReference,
      expect.any(Function),
    );
    expect(dependencies.generate).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        lesson: { identity: lessonReference, material, facts },
      }),
    );
    expect(dependencies.readFacts).toHaveBeenCalledWith(lessonReference);
  });

  it("attributes its model calls to the adaptation's teacher", async () => {
    const dependencies = stubDependencies({
      readJob: vi.fn().mockResolvedValue(generateJob()),
    });

    await executeGenerateSuggestions(JOB_ID, dependencies);
    vi.mocked(dependencies.generate).mock.calls[0]?.[3].createInvoker();

    expect(dependencies.createInvoker).toHaveBeenCalledWith(
      ATTEMPT_ID,
      teacher.teacherId,
    );
  });
});

async function appliedRun(document?: ResourceDocument) {
  return {
    run: {
      outcome: "APPLIED",
      outputs: [
        { document: document ?? (await contributed()), purpose: "revised-resource" },
      ],
    },
  };
}

function moderatorReturning(outcome: ModerationOutcome) {
  const moderate = vi.fn().mockResolvedValue(outcome);
  return { createModerator: vi.fn().mockReturnValue({ moderate }), moderate };
}

describe("applying an accepted suggestion", () => {
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
      executeTransformation: vi.fn().mockResolvedValue(await appliedRun()),
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

  it("attributes its model calls to the adaptation's teacher", async () => {
    const dependencies = stubDependencies({
      executeTransformation: vi.fn().mockResolvedValue(await appliedRun()),
      readJob: vi.fn().mockResolvedValue(applyJob()),
    });

    await executeApplySuggestion(JOB_ID, dependencies);
    vi.mocked(dependencies.executeTransformation).mock.calls[0]?.[1].createInvoker();

    expect(dependencies.createInvoker).toHaveBeenCalledWith(
      ATTEMPT_ID,
      teacher.teacherId,
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

  it("applies at the level the job carries rather than the suggested one", async () => {
    const repository = stubRepository({
      acceptSuggestion: vi.fn(async ({ params }) =>
        acceptedSuggestion({ transformation: { params } }),
      ),
    });
    const dependencies = stubDependencies({
      executeTransformation: vi.fn().mockResolvedValue(await appliedRun()),
      readJob: vi.fn().mockResolvedValue(
        applyJob({
          input: {
            adaptationId: ADAPTATION_ID,
            params: { supportLevel: "mid" },
            resourceDocumentId: DOCUMENT_ID,
            suggestionId: SUGGESTION_ID,
          },
        }),
      ),
      repository,
    });

    await executeApplySuggestion(JOB_ID, dependencies);

    expect(repository.acceptSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({ params: { supportLevel: "mid" } }),
    );
    expect(dependencies.executeTransformation).toHaveBeenCalledWith(
      expect.objectContaining({ params: { supportLevel: "mid" } }),
      expect.any(Object),
    );
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
  it("reruns the same transformation against its primary input", async () => {
    const repository = stubRepository({
      getPendingReview: vi.fn().mockResolvedValue(pendingReview()),
    });
    const dependencies = stubDependencies({
      executeTransformation: vi.fn().mockResolvedValue(await appliedRun()),
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

  it("attributes its model calls to the adaptation's teacher", async () => {
    const dependencies = stubDependencies({
      executeTransformation: vi.fn().mockResolvedValue(await appliedRun()),
      readJob: vi.fn().mockResolvedValue(retryJob()),
      repository: stubRepository({
        getPendingReview: vi.fn().mockResolvedValue(pendingReview()),
      }),
    });

    await executeRetryTransformation(JOB_ID, dependencies);
    vi.mocked(dependencies.executeTransformation).mock.calls[0]?.[1].createInvoker();

    expect(dependencies.createInvoker).toHaveBeenCalledWith(
      ATTEMPT_ID,
      teacher.teacherId,
    );
  });

  it("refuses a retry after its result stops being the current pending head", async () => {
    const dependencies = stubDependencies({
      readJob: vi.fn().mockResolvedValue(retryJob()),
      repository: stubRepository({
        getPendingReview: vi
          .fn()
          .mockResolvedValue(
            pendingReview({ attempt: { id: "88888888-8888-4888-8888-888888888888" } }),
          ),
      }),
    });

    await expect(executeRetryTransformation(JOB_ID, dependencies)).rejects.toThrow(
      "no longer targets a transformation it can rerun",
    );
    expect(dependencies.executeTransformation).not.toHaveBeenCalled();
  });
});

describe("retrying a withheld or failed scaffold", () => {
  const earlier = () => ({
    attempt: storedAttempt({
      completedAt: new Date("2026-02-03T09:01:00.000Z"),
      moderationCategories: ["t/encourages-harmful-behaviour"],
      moderationResult: "toxic",
    }),
    transformation: acceptedSuggestion().transformation,
  });

  it("reruns it from the head it started from, with no review to replace", async () => {
    const { createModerator, moderate } = moderatorReturning({
      outcome: "PASSED",
      scores: {},
    });
    const repository = stubRepository({
      createRetryAttempt: vi
        .fn()
        .mockResolvedValue(storedAttempt({ attemptNumber: 2 })),
      getAdaptationAttempt: vi.fn().mockResolvedValue(earlier()),
    });
    const dependencies = stubDependencies({
      createModerator,
      executeTransformation: vi.fn().mockResolvedValue(await appliedRun()),
      readJob: vi.fn().mockResolvedValue(retryJob()),
      repository,
    });

    await executeRetryTransformation(JOB_ID, dependencies);

    expect(repository.getAdaptationAttempt).toHaveBeenCalledWith(ADAPTATION_ID, {
      attemptId: ATTEMPT_ID,
    });
    expect(repository.createRetryAttempt).toHaveBeenCalledWith({
      jobId: JOB_ID,
      transformationId: TRANSFORMATION_ID,
    });
    const stored = vi.mocked(repository.storeOutputsAndAdvanceHead).mock.calls[0]?.[0];
    expect(stored).toMatchObject({ expectedHeadId: DOCUMENT_ID });
    expect(stored).not.toHaveProperty("expectedPendingAttemptId");
    expect(moderate).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: {
          attemptNumber: 2,
          kind: "scaffold-add-word-bank",
          lessonSlug: lessonReference.lessonSlug,
        },
      }),
    );
  });

  it("refuses once the worksheet has moved on from where the scaffold started", async () => {
    const dependencies = stubDependencies({
      readJob: vi.fn().mockResolvedValue(retryJob()),
      repository: stubRepository({
        getAdaptationAttempt: vi.fn().mockResolvedValue(earlier()),
        getPrimaryTransformationInput: vi
          .fn()
          .mockResolvedValue(storedDocument("77777777-7777-4777-8777-777777777777")),
      }),
    });

    await expect(executeRetryTransformation(JOB_ID, dependencies)).rejects.toThrow(
      "no longer targets a transformation it can rerun",
    );
    expect(dependencies.executeTransformation).not.toHaveBeenCalled();
  });

  it.each([
    ["an attempt of another adaptation", null],
    [
      "an accepted attempt",
      {
        ...earlier(),
        attempt: storedAttempt({ acceptedAt: new Date(), completedAt: new Date() }),
      },
    ],
  ])("refuses %s", async (_name, found) => {
    const dependencies = stubDependencies({
      readJob: vi.fn().mockResolvedValue(retryJob()),
      repository: stubRepository({
        getAdaptationAttempt: vi.fn().mockResolvedValue(found),
      }),
    });

    await expect(executeRetryTransformation(JOB_ID, dependencies)).rejects.toThrow(
      "no longer targets a transformation it can rerun",
    );
  });
});

describe("moderating a generated scaffold", () => {
  const flagged = (codes: string[]): ModerationOutcome => ({
    outcome: "FLAGGED",
    flaggedCategories: [],
    unrecognisedCategories: codes,
    scores: {},
  });

  async function apply(outcome: ModerationOutcome, document?: ResourceDocument) {
    const { createModerator, moderate } = moderatorReturning(outcome);
    const repository = stubRepository();
    const dependencies = stubDependencies({
      createModerator,
      executeTransformation: vi.fn().mockResolvedValue(await appliedRun(document)),
      readJob: vi.fn().mockResolvedValue(applyJob()),
      repository,
    });
    const applied = executeApplySuggestion(JOB_ID, dependencies);
    return { applied, moderate, repository };
  }

  it("sends only the scaffold's own text, with the adaptation and attempt", async () => {
    const { applied, moderate } = await apply({ outcome: "PASSED", scores: {} });
    await applied;

    expect(moderate).toHaveBeenCalledWith({
      content: "Added support",
      context: { sessionId: ADAPTATION_ID, messageId: ATTEMPT_ID },
      subject: {
        attemptNumber: 1,
        kind: "scaffold-add-word-bank",
        lessonSlug: lessonReference.lessonSlug,
      },
    });
  });

  it.each([
    [{ outcome: "PASSED", scores: {} } as const, "safe", []],
    [
      flagged(["p/practical-activities"]),
      "guidance-required",
      ["p/practical-activities"],
    ],
  ])("stores a shown result with the head: %j", async (outcome, result, categories) => {
    const { applied, repository } = await apply(outcome);
    await applied;

    expect(repository.storeOutputsAndAdvanceHead).toHaveBeenCalledWith(
      expect.objectContaining({ moderation: { result, categories } }),
    );
    expect(repository.completeWithheldAttempt).not.toHaveBeenCalled();
  });

  it.each([
    [["n/self-harm-suicide"], "highly-sensitive"],
    [["n/self-harm-suicide", "t/encourages-harmful-behaviour"], "toxic"],
  ])("withholds %j as %s and leaves the head alone", async (codes, result) => {
    const { applied, repository } = await apply(flagged(codes));
    await applied;

    expect(repository.completeWithheldAttempt).toHaveBeenCalledWith({
      attemptId: ATTEMPT_ID,
      moderation: { result, categories: codes },
    });
    expect(repository.storeOutputsAndAdvanceHead).not.toHaveBeenCalled();
  });

  it("fails the step when moderation fails, naming only the reason", async () => {
    const { applied, repository } = await apply({
      outcome: "FAILED",
      reason: "TIMED_OUT",
      cause: new Error("Added support"),
    });

    await expect(applied).rejects.toThrow(
      "Moderating the generated scaffold failed: TIMED_OUT.",
    );
    await expect(applied).rejects.not.toThrow("Added support");
    expect(repository.storeOutputsAndAdvanceHead).not.toHaveBeenCalled();
    expect(repository.completeWithheldAttempt).not.toHaveBeenCalled();
  });

  it("fails the step rather than passing a scaffold with no text", async () => {
    const { applied, moderate, repository } = await apply(
      { outcome: "PASSED", scores: {} },
      await loadWorksheet(),
    );

    await expect(applied).rejects.toThrow("no text to moderate");
    expect(moderate).not.toHaveBeenCalled();
    expect(repository.storeOutputsAndAdvanceHead).not.toHaveBeenCalled();
  });

  it("moderates a retried scaffold before it replaces the pending one", async () => {
    const { createModerator } = moderatorReturning(flagged(["t/new-code"]));
    const repository = stubRepository({
      getPendingReview: vi.fn().mockResolvedValue(pendingReview()),
    });
    const dependencies = stubDependencies({
      createModerator,
      executeTransformation: vi.fn().mockResolvedValue(await appliedRun()),
      readJob: vi.fn().mockResolvedValue(retryJob()),
      repository,
    });

    await executeRetryTransformation(JOB_ID, dependencies);

    expect(repository.completeWithheldAttempt).toHaveBeenCalledWith({
      attemptId: ATTEMPT_ID,
      moderation: { result: "toxic", categories: ["t/new-code"] },
    });
    expect(repository.storeOutputsAndAdvanceHead).not.toHaveBeenCalled();
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
    const question = getResourceNodesByType(currentDocument, "question")[0];
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
