import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  acceptWorksheetScaffoldingReview,
  enqueueSuggestionApplication,
  enqueueWorksheetScaffoldingRetry,
  getWorksheetScaffoldingState,
  openWorksheetScaffolding,
  enqueueWorksheetScaffoldingRemoval,
  enqueueWorksheetScaffoldingDismissal,
  undoWorksheetScaffoldingReview,
  type WorksheetScaffoldingDependencies,
  type WorksheetScaffoldingServiceRepository,
} from "./service";
import {
  ADAPTATION_ID,
  DOCUMENT_ID,
  JOB_ID,
  SUGGESTION_ID,
  TRANSFORMATION_ID,
  ATTEMPT_ID,
  NEXT_DOCUMENT_ID,
  REQUEST_ID,
  lesson,
  loadWorksheet,
  pendingReview,
  head,
  storedSuggestion,
  repositoryDefaults,
  retryJob,
  teacher,
} from "./test-doubles";
import { ConcurrencyConflictError } from "../jobs/job-repository";
import {
  CONTRIBUTION_EXTENSION_KEY,
  type ResourceDocument,
} from "@oaknational/resource-document";

let worksheet: ResourceDocument;

beforeAll(async () => {
  worksheet = await loadWorksheet();
});

function stubRepository(
  overrides: Partial<WorksheetScaffoldingServiceRepository> = {},
): WorksheetScaffoldingServiceRepository {
  const doubles = Object.fromEntries(
    Object.entries(repositoryDefaults()).map(([name, result]) => [
      name,
      vi.fn().mockResolvedValue(result),
    ]),
  );
  return {
    ...doubles,
    ...overrides,
  } as unknown as WorksheetScaffoldingServiceRepository;
}

function stubDependencies(
  overrides: Partial<WorksheetScaffoldingDependencies> = {},
): WorksheetScaffoldingDependencies {
  return {
    enqueue: vi.fn(),
    resumableCutoff: () => new Date("2026-01-01T00:00:00.000Z"),
    readSourceDocument: vi.fn().mockResolvedValue(worksheet),
    repository: stubRepository(),
    ...overrides,
  } as unknown as WorksheetScaffoldingDependencies;
}

describe("opening worksheet scaffolding", () => {
  it("declines a lesson with no source worksheet", async () => {
    const dependencies = stubDependencies({
      readSourceDocument: vi.fn().mockResolvedValue(null),
    });

    await expect(
      openWorksheetScaffolding({ lesson }, teacher, dependencies),
    ).resolves.toBeNull();
    expect(dependencies.enqueue).not.toHaveBeenCalled();
  });

  it("offers unfinished work back before creating anything", async () => {
    const repository = stubRepository({
      findResumableAdaptation: vi.fn().mockResolvedValue({
        id: ADAPTATION_ID,
        pendingScaffoldCount: 1,
        scaffoldCount: 2,
        updatedAt: new Date("2026-02-03T09:00:00.000Z"),
      }),
    });
    const dependencies = stubDependencies({ repository });

    await expect(
      openWorksheetScaffolding({ lesson }, teacher, dependencies),
    ).resolves.toEqual({
      outcome: "resumable",
      resumable: {
        adaptationId: ADAPTATION_ID,
        pendingScaffoldCount: 1,
        scaffoldCount: 2,
        updatedAt: "2026-02-03T09:00:00.000Z",
      },
    });
    expect(repository.createAdaptationWithSourceDocument).not.toHaveBeenCalled();
    expect(dependencies.enqueue).not.toHaveBeenCalled();
  });

  it("looks for resumable work as this teacher on this lesson and capability", async () => {
    const repository = stubRepository();
    const dependencies = stubDependencies({ repository });

    await openWorksheetScaffolding({ lesson }, teacher, dependencies);

    expect(repository.findResumableAdaptation).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityId: "worksheetScaffolding",
        lesson,
        teacherId: teacher.teacherId,
      }),
    );
  });

  it("atomically replaces the declined adaptation", async () => {
    const repository = stubRepository({
      findResumableAdaptation: vi.fn().mockResolvedValue({
        id: ADAPTATION_ID,
        pendingScaffoldCount: 0,
        scaffoldCount: 1,
        updatedAt: new Date("2026-02-03T09:00:00.000Z"),
      }),
    });
    const dependencies = stubDependencies({ repository });

    const entry = await openWorksheetScaffolding(
      {
        lesson,
        replacing: { adaptationId: ADAPTATION_ID, requestId: REQUEST_ID },
      },
      teacher,
      dependencies,
    );

    expect(repository.replaceAdaptationWithSourceDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        replacingAdaptationId: ADAPTATION_ID,
        replacementRequestId: REQUEST_ID,
        teacherId: teacher.teacherId,
      }),
    );
    expect(repository.createAdaptationWithSourceDocument).not.toHaveBeenCalled();
    expect(repository.findResumableAdaptation).not.toHaveBeenCalled();
    expect(entry).toMatchObject({ outcome: "opened" });
  });

  it("does not replace the old work when the new worksheet cannot be read", async () => {
    const repository = stubRepository();
    const dependencies = stubDependencies({
      readSourceDocument: vi.fn().mockResolvedValue(null),
      repository,
    });

    await expect(
      openWorksheetScaffolding(
        {
          lesson,
          replacing: { adaptationId: ADAPTATION_ID, requestId: REQUEST_ID },
        },
        teacher,
        dependencies,
      ),
    ).resolves.toBeNull();
    expect(repository.replaceAdaptationWithSourceDocument).not.toHaveBeenCalled();
  });

  it("stores the worksheet and asks for suggestions on the capability's flow", async () => {
    const dependencies = stubDependencies();

    const entry = await openWorksheetScaffolding({ lesson }, teacher, dependencies);

    expect(entry).toMatchObject({ outcome: "opened" });
    expect(dependencies.enqueue).toHaveBeenCalledWith({
      concurrencyKey: `adaptation:${ADAPTATION_ID}:head:${DOCUMENT_ID}`,
      idempotencyKey: `suggest:${DOCUMENT_ID}`,
      input: {
        adaptationId: ADAPTATION_ID,
        flowId: "worksheet-scaffolding",
        resourceDocumentId: DOCUMENT_ID,
      },
      kind: "suggestions.generate",
    });
  });
});

describe("reading worksheet scaffolding state", () => {
  it("scopes the adaptation to the teacher asking for it", async () => {
    const dependencies = stubDependencies();

    await getWorksheetScaffoldingState(ADAPTATION_ID, teacher, dependencies);

    expect(dependencies.repository.getAdaptationHead).toHaveBeenCalledWith(
      ADAPTATION_ID,
      teacher.teacherId,
    );
    expect(dependencies.repository.getLatestJobForConcurrencyKey).toHaveBeenCalledWith(
      `adaptation:${ADAPTATION_ID}:head:${DOCUMENT_ID}`,
      [
        "suggestions.apply",
        "suggestions.generate",
        "transformations.remove",
        "transformations.retry",
        "transformations.dismiss",
      ],
    );
  });

  it("labels an offer with its registered transformation", async () => {
    const dependencies = stubDependencies({
      repository: stubRepository({
        listOpenSuggestions: vi.fn().mockResolvedValue([storedSuggestion()]),
      }),
    });

    await expect(
      getWorksheetScaffoldingState(ADAPTATION_ID, teacher, dependencies),
    ).resolves.toMatchObject({
      suggestions: [{ id: SUGGESTION_ID, label: "Add a word bank" }],
    });
  });

  it("ignores a job whose kind this workflow does not own", async () => {
    const dependencies = stubDependencies({
      repository: stubRepository({
        getLatestJobForConcurrencyKey: vi
          .fn()
          .mockResolvedValue({ id: JOB_ID, kind: "test.echo", status: "queued" }),
      }),
    });

    await expect(
      getWorksheetScaffoldingState(ADAPTATION_ID, teacher, dependencies),
    ).resolves.toMatchObject({ job: null });
  });

  it("asks for suggestions for a head that has never had a run", async () => {
    const dependencies = stubDependencies();

    await getWorksheetScaffoldingState(ADAPTATION_ID, teacher, dependencies);

    expect(dependencies.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: `suggest:${DOCUMENT_ID}` }),
    );
  });

  it("asks for suggestions after a scaffold removal changes the worksheet", async () => {
    const repository = stubRepository({
      getLatestJobForConcurrencyKey: vi
        .fn()
        .mockResolvedValueOnce({
          failureMessage: null,
          id: JOB_ID,
          kind: "transformations.remove",
          status: "succeeded",
        })
        .mockResolvedValue(null),
    });
    const dependencies = stubDependencies({ repository });

    await getWorksheetScaffoldingState(ADAPTATION_ID, teacher, dependencies);

    expect(dependencies.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: `suggest:${DOCUMENT_ID}` }),
    );
  });

  it("waits rather than asking again while a run is in flight", async () => {
    const dependencies = stubDependencies({
      repository: stubRepository({
        getLatestJobForConcurrencyKey: vi.fn().mockResolvedValue({
          failureMessage: null,
          id: JOB_ID,
          kind: "suggestions.generate",
          status: "running",
        }),
      }),
    });

    await getWorksheetScaffoldingState(ADAPTATION_ID, teacher, dependencies);

    expect(dependencies.enqueue).not.toHaveBeenCalled();
  });

  it("returns a failed scaffold application instead of an older suggestion run", async () => {
    const failedApplication = {
      failureMessage: "The transformation could not be applied.",
      id: JOB_ID,
      kind: "suggestions.apply",
      status: "failed",
    } as const;
    const repository = stubRepository({
      getLatestJobForConcurrencyKey: vi.fn().mockResolvedValue(failedApplication),
    });
    const dependencies = stubDependencies({ repository });

    await expect(
      getWorksheetScaffoldingState(ADAPTATION_ID, teacher, dependencies),
    ).resolves.toMatchObject({ job: failedApplication });
    expect(dependencies.enqueue).not.toHaveBeenCalled();
  });

  it("keeps a failed retry visible while its original result is still pending", async () => {
    const failedRetry = retryJob({
      failureMessage: "The retry could not be applied.",
      status: "failed",
    });
    const dependencies = stubDependencies({
      repository: stubRepository({
        getLatestJobForConcurrencyKey: vi.fn().mockResolvedValue(failedRetry),
        getPendingReview: vi.fn().mockResolvedValue(pendingReview()),
      }),
    });

    await expect(
      getWorksheetScaffoldingState(ADAPTATION_ID, teacher, dependencies),
    ).resolves.toMatchObject({
      job: {
        failureMessage: failedRetry.failureMessage,
        id: failedRetry.id,
        kind: failedRetry.kind,
        status: failedRetry.status,
      },
    });
    expect(dependencies.enqueue).not.toHaveBeenCalled();
  });

  it("does not ask again when a completed run found nothing to suggest", async () => {
    const dependencies = stubDependencies({
      repository: stubRepository({
        getLatestJobForConcurrencyKey: vi.fn().mockResolvedValue({
          failureMessage: null,
          id: JOB_ID,
          kind: "suggestions.generate",
          status: "succeeded",
        }),
      }),
    });

    await getWorksheetScaffoldingState(ADAPTATION_ID, teacher, dependencies);

    expect(dependencies.enqueue).not.toHaveBeenCalled();
  });

  it("leaves an offered scaffold alone rather than asking for more", async () => {
    const dependencies = stubDependencies({
      repository: stubRepository({
        listOpenSuggestions: vi.fn().mockResolvedValue([storedSuggestion()]),
      }),
    });

    await getWorksheetScaffoldingState(ADAPTATION_ID, teacher, dependencies);

    expect(dependencies.enqueue).not.toHaveBeenCalled();
  });

  it("returns one pending review and waits for the teacher's decision", async () => {
    const dependencies = stubDependencies({
      repository: stubRepository({
        getPendingReview: vi.fn().mockResolvedValue(pendingReview()),
      }),
    });

    await expect(
      getWorksheetScaffoldingState(ADAPTATION_ID, teacher, dependencies),
    ).resolves.toMatchObject({
      pendingReview: {
        attemptId: ATTEMPT_ID,
        contributionId: TRANSFORMATION_ID,
        label: "Add a word bank",
        reason: "This question depends on recalling several topic words.",
      },
    });
    expect(dependencies.enqueue).not.toHaveBeenCalled();
  });
});

describe("accepting a suggestion", () => {
  it("declines an adaptation the teacher does not own", async () => {
    const dependencies = stubDependencies({
      repository: stubRepository({
        getAdaptationHead: vi.fn().mockResolvedValue(null),
      }),
    });

    await expect(
      enqueueSuggestionApplication(
        { adaptationId: ADAPTATION_ID, suggestionId: SUGGESTION_ID },
        teacher,
        dependencies,
      ),
    ).resolves.toBeNull();
    expect(dependencies.enqueue).not.toHaveBeenCalled();
  });

  it("declines an offer that is gone or already accepted", async () => {
    const dependencies = stubDependencies({
      repository: stubRepository({
        getOpenSuggestion: vi.fn().mockResolvedValue(null),
      }),
    });

    await expect(
      enqueueSuggestionApplication(
        { adaptationId: ADAPTATION_ID, suggestionId: SUGGESTION_ID },
        teacher,
        dependencies,
      ),
    ).resolves.toBeNull();
    expect(dependencies.enqueue).not.toHaveBeenCalled();
  });

  it("keys a reopened offer apart from the acceptance that was undone", async () => {
    const dependencies = stubDependencies({
      repository: stubRepository({
        getOpenSuggestion: vi
          .fn()
          .mockResolvedValue(storedSuggestion({ undoCount: 1 })),
      }),
    });

    await enqueueSuggestionApplication(
      { adaptationId: ADAPTATION_ID, suggestionId: SUGGESTION_ID },
      teacher,
      dependencies,
    );

    expect(dependencies.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: `apply:${SUGGESTION_ID}:1` }),
    );
  });

  it("keys the job on the offer, so a repeated request is the same work", async () => {
    const dependencies = stubDependencies();

    await enqueueSuggestionApplication(
      { adaptationId: ADAPTATION_ID, suggestionId: SUGGESTION_ID },
      teacher,
      dependencies,
    );

    expect(dependencies.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        concurrencyKey: `adaptation:${ADAPTATION_ID}:head:${DOCUMENT_ID}`,
        idempotencyKey: `apply:${SUGGESTION_ID}:0`,
        input: expect.objectContaining({ resourceDocumentId: DOCUMENT_ID }),
      }),
    );
  });

  it("does not ask for suggestions while an application is being queued", async () => {
    const dependencies = stubDependencies();

    await enqueueSuggestionApplication(
      { adaptationId: ADAPTATION_ID, suggestionId: SUGGESTION_ID },
      teacher,
      dependencies,
    );

    expect(dependencies.enqueue).toHaveBeenCalledTimes(1);
  });

  it("enqueues the validated parameters rather than the raw request", async () => {
    const dependencies = stubDependencies();

    await enqueueSuggestionApplication(
      {
        adaptationId: ADAPTATION_ID,
        params: { supportLevel: "mid" },
        suggestionId: SUGGESTION_ID,
      },
      teacher,
      dependencies,
    );

    expect(dependencies.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ params: { supportLevel: "mid" } }),
      }),
    );
  });

  it("refuses parameters the transformation does not accept", async () => {
    const dependencies = stubDependencies();

    await expect(
      enqueueSuggestionApplication(
        {
          adaptationId: ADAPTATION_ID,
          params: { supportLevel: "enormous" },
          suggestionId: SUGGESTION_ID,
        },
        teacher,
        dependencies,
      ),
    ).rejects.toThrow();
    expect(dependencies.enqueue).not.toHaveBeenCalled();
  });
});

function contributedWorksheet(): ResourceDocument {
  return {
    ...worksheet,
    content: [
      ...worksheet.content,
      {
        id: "accepted-support",
        type: "paragraph" as const,
        content: [{ type: "text" as const, text: "Accepted support" }],
        extensions: { [CONTRIBUTION_EXTENSION_KEY]: TRANSFORMATION_ID },
      },
    ],
  } satisfies ResourceDocument;
}

describe("work that collides with a job already running on the head", () => {
  const collides = () =>
    vi.fn().mockRejectedValue(new ConcurrencyConflictError("already running"));

  it("reports the current state rather than failing the teacher's request", async () => {
    const dependencies = stubDependencies({
      enqueue: collides(),
      repository: stubRepository({
        getPendingReview: vi.fn().mockResolvedValue(pendingReview()),
      }),
    });

    await expect(
      enqueueWorksheetScaffoldingRetry(
        { adaptationId: ADAPTATION_ID, attemptId: ATTEMPT_ID, requestId: REQUEST_ID },
        teacher,
        dependencies,
      ),
    ).resolves.toMatchObject({ adaptationId: ADAPTATION_ID });
  });

  it("still reads state when a generation request collides", async () => {
    const dependencies = stubDependencies({ enqueue: collides() });

    await expect(
      getWorksheetScaffoldingState(ADAPTATION_ID, teacher, dependencies),
    ).resolves.toMatchObject({ adaptationId: ADAPTATION_ID });
  });

  it("lets any other enqueue failure surface", async () => {
    const dependencies = stubDependencies({
      enqueue: vi.fn().mockRejectedValue(new Error("the queue is unreachable")),
    });

    await expect(
      getWorksheetScaffoldingState(ADAPTATION_ID, teacher, dependencies),
    ).rejects.toThrow("the queue is unreachable");
  });
});

describe("reviewing an applied scaffold", () => {
  it("accepts only the attempt that produced the current head", async () => {
    const getPendingReview = vi
      .fn()
      .mockResolvedValueOnce(pendingReview())
      .mockResolvedValue(null);
    const repository = stubRepository({
      acceptPendingReview: vi.fn().mockResolvedValue(true),
      getPendingReview,
    });
    const dependencies = stubDependencies({ repository });

    await acceptWorksheetScaffoldingReview(
      { adaptationId: ADAPTATION_ID, attemptId: ATTEMPT_ID },
      teacher,
      dependencies,
    );

    expect(repository.acceptPendingReview).toHaveBeenCalledWith({
      adaptationId: ADAPTATION_ID,
      attemptId: ATTEMPT_ID,
      expectedHeadId: DOCUMENT_ID,
    });
    expect(dependencies.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: `suggest:${DOCUMENT_ID}`,
        kind: "suggestions.generate",
      }),
    );
  });

  it("moves undo back to the immutable input document", async () => {
    const repository = stubRepository({
      getAdaptationHead: vi
        .fn()
        .mockResolvedValueOnce(head(NEXT_DOCUMENT_ID))
        .mockResolvedValue(head(DOCUMENT_ID)),
      getPendingReview: vi
        .fn()
        .mockResolvedValueOnce(pendingReview())
        .mockResolvedValue(null),
      listOpenSuggestions: vi.fn().mockResolvedValue([storedSuggestion()]),
      undoPendingReview: vi.fn().mockResolvedValue(true),
    });
    const dependencies = stubDependencies({ repository });

    const state = await undoWorksheetScaffoldingReview(
      { adaptationId: ADAPTATION_ID, attemptId: ATTEMPT_ID },
      teacher,
      dependencies,
    );

    expect(repository.undoPendingReview).toHaveBeenCalledWith({
      adaptationId: ADAPTATION_ID,
      expectedHeadId: NEXT_DOCUMENT_ID,
      previousHeadId: DOCUMENT_ID,
      transformationId: TRANSFORMATION_ID,
    });
    expect(state).toMatchObject({ suggestions: [{ id: SUGGESTION_ID }] });
    expect(dependencies.enqueue).not.toHaveBeenCalled();
  });

  it("queues a retry against the pending attempt and current head", async () => {
    const dependencies = stubDependencies({
      repository: stubRepository({
        getPendingReview: vi.fn().mockResolvedValue(pendingReview()),
      }),
    });

    await enqueueWorksheetScaffoldingRetry(
      { adaptationId: ADAPTATION_ID, attemptId: ATTEMPT_ID, requestId: REQUEST_ID },
      teacher,
      dependencies,
    );

    expect(dependencies.enqueue).toHaveBeenCalledWith({
      concurrencyKey: `adaptation:${ADAPTATION_ID}:head:${DOCUMENT_ID}`,
      idempotencyKey: `retry:${ATTEMPT_ID}:${REQUEST_ID}`,
      input: {
        adaptationId: ADAPTATION_ID,
        attemptId: ATTEMPT_ID,
        requestId: REQUEST_ID,
        resourceDocumentId: DOCUMENT_ID,
      },
      kind: "transformations.retry",
    });
  });

  it("uses a fresh request identifier for each deliberate retry", async () => {
    const dependencies = stubDependencies({
      repository: stubRepository({
        getPendingReview: vi.fn().mockResolvedValue(pendingReview()),
      }),
    });
    const anotherRequestId = "99999999-9999-4999-8999-999999999999";

    await enqueueWorksheetScaffoldingRetry(
      { adaptationId: ADAPTATION_ID, attemptId: ATTEMPT_ID, requestId: REQUEST_ID },
      teacher,
      dependencies,
    );
    await enqueueWorksheetScaffoldingRetry(
      {
        adaptationId: ADAPTATION_ID,
        attemptId: ATTEMPT_ID,
        requestId: anotherRequestId,
      },
      teacher,
      dependencies,
    );

    expect(dependencies.enqueue).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        idempotencyKey: `retry:${ATTEMPT_ID}:${REQUEST_ID}`,
      }),
    );
    expect(dependencies.enqueue).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        idempotencyKey: `retry:${ATTEMPT_ID}:${anotherRequestId}`,
      }),
    );
  });

  it("lets acceptance supersede a failed retry and requests fresh suggestions", async () => {
    const failedRetry = retryJob({
      failureMessage: "The retry could not be applied.",
      status: "failed",
    });
    const getPendingReview = vi
      .fn()
      .mockResolvedValueOnce(pendingReview())
      .mockResolvedValue(null);
    const repository = stubRepository({
      acceptPendingReview: vi.fn().mockResolvedValue(true),
      getLatestJobForConcurrencyKey: vi.fn((_, kinds: readonly string[]) =>
        Promise.resolve(kinds.length === 1 ? null : failedRetry),
      ),
      getPendingReview,
    });
    const dependencies = stubDependencies({ repository });

    const state = await acceptWorksheetScaffoldingReview(
      { adaptationId: ADAPTATION_ID, attemptId: ATTEMPT_ID },
      teacher,
      dependencies,
    );

    expect(state?.job).toBeNull();
    expect(dependencies.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "suggestions.generate" }),
    );
  });

  it("queues removal of an accepted contribution on the current head", async () => {
    const contributed = contributedWorksheet();
    const removalJob = {
      failureMessage: null,
      id: JOB_ID,
      kind: "transformations.remove",
      status: "queued",
    } as const;
    const dependencies = stubDependencies({
      repository: stubRepository({
        getAdaptationHead: vi.fn().mockResolvedValue(head(DOCUMENT_ID, contributed)),
        getLatestJobForConcurrencyKey: vi.fn().mockResolvedValue(removalJob),
        isAcceptedContribution: vi.fn().mockResolvedValue(true),
      }),
    });

    const state = await enqueueWorksheetScaffoldingRemoval(
      { adaptationId: ADAPTATION_ID, contributionId: TRANSFORMATION_ID },
      teacher,
      dependencies,
    );

    expect(dependencies.enqueue).toHaveBeenCalledWith({
      concurrencyKey: `adaptation:${ADAPTATION_ID}:head:${DOCUMENT_ID}`,
      idempotencyKey: `remove:${DOCUMENT_ID}:${TRANSFORMATION_ID}`,
      input: {
        adaptationId: ADAPTATION_ID,
        contributionId: TRANSFORMATION_ID,
        resourceDocumentId: DOCUMENT_ID,
      },
      kind: "transformations.remove",
    });
    expect(state).toMatchObject({ job: removalJob });
  });

  it("records that no scaffold is required at an existing target", async () => {
    const question = worksheet.content.find((node) => node.type === "question");
    if (question === undefined) {
      throw new Error("The worksheet fixture needs a question.");
    }
    const dependencies = stubDependencies();

    await enqueueWorksheetScaffoldingDismissal(
      { adaptationId: ADAPTATION_ID, targetBlockId: question.id },
      teacher,
      dependencies,
    );

    expect(dependencies.enqueue).toHaveBeenCalledWith({
      concurrencyKey: `adaptation:${ADAPTATION_ID}:head:${DOCUMENT_ID}`,
      idempotencyKey: `dismiss:${DOCUMENT_ID}:${question.id}`,
      input: {
        adaptationId: ADAPTATION_ID,
        resourceDocumentId: DOCUMENT_ID,
        targetBlockId: question.id,
      },
      kind: "transformations.dismiss",
    });
  });

  it.each(["accept", "retry", "undo"] as const)(
    "refuses to %s an attempt that is not the pending review",
    async (action) => {
      const run = {
        accept: acceptWorksheetScaffoldingReview,
        retry: enqueueWorksheetScaffoldingRetry,
        undo: undoWorksheetScaffoldingReview,
      }[action];
      const repository = stubRepository({
        getPendingReview: vi
          .fn()
          .mockResolvedValue(pendingReview({ attempt: { id: NEXT_DOCUMENT_ID } })),
      });
      const dependencies = stubDependencies({ repository });

      await expect(
        run(
          {
            adaptationId: ADAPTATION_ID,
            attemptId: ATTEMPT_ID,
            requestId: REQUEST_ID,
          },
          teacher,
          dependencies,
        ),
      ).resolves.toBeNull();
      expect(dependencies.enqueue).not.toHaveBeenCalled();
      expect(repository.acceptPendingReview).not.toHaveBeenCalled();
      expect(repository.undoPendingReview).not.toHaveBeenCalled();
    },
  );

  it("reports a lost race rather than a state where acceptance did not happen", async () => {
    const repository = stubRepository({
      acceptPendingReview: vi.fn().mockResolvedValue(false),
      getPendingReview: vi.fn().mockResolvedValue(pendingReview()),
    });
    const dependencies = stubDependencies({ repository });

    await expect(
      acceptWorksheetScaffoldingReview(
        { adaptationId: ADAPTATION_ID, attemptId: ATTEMPT_ID },
        teacher,
        dependencies,
      ),
    ).resolves.toBeNull();
  });

  it("refuses to undo when the transformation's input document is gone", async () => {
    const repository = stubRepository({
      getPendingReview: vi.fn().mockResolvedValue(pendingReview()),
      getPrimaryTransformationInput: vi.fn().mockResolvedValue(null),
    });
    const dependencies = stubDependencies({ repository });

    await expect(
      undoWorksheetScaffoldingReview(
        { adaptationId: ADAPTATION_ID, attemptId: ATTEMPT_ID },
        teacher,
        dependencies,
      ),
    ).resolves.toBeNull();
    expect(repository.undoPendingReview).not.toHaveBeenCalled();
  });

  it("refuses to remove a contribution that is not on the worksheet", async () => {
    const dependencies = stubDependencies();

    await expect(
      enqueueWorksheetScaffoldingRemoval(
        { adaptationId: ADAPTATION_ID, contributionId: TRANSFORMATION_ID },
        teacher,
        dependencies,
      ),
    ).resolves.toBeNull();
    expect(dependencies.enqueue).not.toHaveBeenCalled();
  });

  it("refuses to remove a contribution the teacher never accepted", async () => {
    const contributed = contributedWorksheet();
    const dependencies = stubDependencies({
      repository: stubRepository({
        getAdaptationHead: vi.fn().mockResolvedValue(head(DOCUMENT_ID, contributed)),
        isAcceptedContribution: vi.fn().mockResolvedValue(false),
      }),
    });

    await expect(
      enqueueWorksheetScaffoldingRemoval(
        { adaptationId: ADAPTATION_ID, contributionId: TRANSFORMATION_ID },
        teacher,
        dependencies,
      ),
    ).resolves.toBeNull();
    expect(dependencies.enqueue).not.toHaveBeenCalled();
  });

  it("refuses to remove an accepted contribution while another review is pending", async () => {
    const contributed = contributedWorksheet();
    const dependencies = stubDependencies({
      repository: stubRepository({
        getAdaptationHead: vi.fn().mockResolvedValue(head(DOCUMENT_ID, contributed)),
        getPendingReview: vi.fn().mockResolvedValue(pendingReview()),
      }),
    });

    await expect(
      enqueueWorksheetScaffoldingRemoval(
        { adaptationId: ADAPTATION_ID, contributionId: TRANSFORMATION_ID },
        teacher,
        dependencies,
      ),
    ).resolves.toBeNull();
    expect(dependencies.enqueue).not.toHaveBeenCalled();
  });

  it("dismisses the whole document when no target is named", async () => {
    const dependencies = stubDependencies();

    await enqueueWorksheetScaffoldingDismissal(
      { adaptationId: ADAPTATION_ID, targetBlockId: null },
      teacher,
      dependencies,
    );

    expect(dependencies.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          adaptationId: ADAPTATION_ID,
          resourceDocumentId: DOCUMENT_ID,
          targetBlockId: null,
        },
      }),
    );
  });

  it("refuses dismissal while a review is pending", async () => {
    const dependencies = stubDependencies({
      repository: stubRepository({
        getPendingReview: vi.fn().mockResolvedValue(pendingReview()),
      }),
    });

    await expect(
      enqueueWorksheetScaffoldingDismissal(
        { adaptationId: ADAPTATION_ID, targetBlockId: null },
        teacher,
        dependencies,
      ),
    ).resolves.toBeNull();
    expect(dependencies.enqueue).not.toHaveBeenCalled();
  });

  it.each([
    ["accept", acceptWorksheetScaffoldingReview],
    ["undo", undoWorksheetScaffoldingReview],
    ["retry", enqueueWorksheetScaffoldingRetry],
  ] as const)(
    "declines %s on an adaptation the teacher does not own",
    async (_, run) => {
      const dependencies = stubDependencies({
        repository: stubRepository({
          getAdaptationHead: vi.fn().mockResolvedValue(null),
        }),
      });

      await expect(
        run(
          {
            adaptationId: ADAPTATION_ID,
            attemptId: ATTEMPT_ID,
            requestId: REQUEST_ID,
          },
          teacher,
          dependencies,
        ),
      ).resolves.toBeNull();
    },
  );

  it("does not dismiss a target outside the current document", async () => {
    const dependencies = stubDependencies();

    await expect(
      enqueueWorksheetScaffoldingDismissal(
        { adaptationId: ADAPTATION_ID, targetBlockId: "missing" },
        teacher,
        dependencies,
      ),
    ).resolves.toBeNull();
    expect(dependencies.enqueue).not.toHaveBeenCalled();
  });
});
