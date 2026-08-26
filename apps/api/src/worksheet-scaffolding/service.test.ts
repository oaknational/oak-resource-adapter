import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  enqueueSuggestionApplication,
  getWorksheetScaffoldingState,
  openWorksheetScaffolding,
  type WorksheetScaffoldingDependencies,
  type WorksheetScaffoldingServiceRepository,
} from "./service";
import {
  ADAPTATION_ID,
  DOCUMENT_ID,
  JOB_ID,
  SUGGESTION_ID,
  lesson,
  loadWorksheet,
  storedSuggestion,
  repositoryDefaults,
  teacher,
} from "./test-doubles";
import type { ResourceDocument } from "@oaknational/resource-document";

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
        scaffoldCount: 1,
        updatedAt: new Date("2026-02-03T09:00:00.000Z"),
      }),
    });
    const dependencies = stubDependencies({ repository });

    const entry = await openWorksheetScaffolding(
      { lesson, replacing: ADAPTATION_ID },
      teacher,
      dependencies,
    );

    expect(repository.replaceAdaptationWithSourceDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        replacingAdaptationId: ADAPTATION_ID,
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
        { lesson, replacing: ADAPTATION_ID },
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
      ["suggestions.apply", "suggestions.generate"],
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

  it("asks for suggestions once an accepted scaffold has changed the worksheet", async () => {
    const dependencies = stubDependencies({
      repository: stubRepository({
        getLatestJobForConcurrencyKey: vi.fn().mockResolvedValue({
          failureMessage: null,
          id: JOB_ID,
          kind: "suggestions.apply",
          status: "succeeded",
        }),
      }),
    });

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
        idempotencyKey: `apply:${SUGGESTION_ID}`,
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
