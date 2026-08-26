import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  executeApplySuggestion,
  executeGenerateSuggestions,
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
  repositoryDefaults,
} from "./test-doubles";

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
