import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WorksheetScaffoldingState } from "@oaknational/resource-adapter-contracts/internal";
import type { ResourceDocument } from "@oaknational/resource-document";

import { createResourceAdapterInternalClient } from "./client.js";
import { ResourceAdapterApiError } from "./errors.js";
import {
  acceptWorksheetScaffoldingReview,
  applyWorksheetScaffoldingSuggestion,
  enqueueWorksheetScaffoldingDismissal,
  enqueueWorksheetScaffoldingRemoval,
  getWorksheetScaffolding,
  openWorksheetScaffolding,
  retryWorksheetScaffoldingReview,
  undoWorksheetScaffoldingReview,
} from "./worksheetScaffolding.js";

const api = vi.hoisted(() => ({
  accept: vi.fn(),
  applySuggestion: vi.fn(),
  dismiss: vi.fn(),
  get: vi.fn(),
  open: vi.fn(),
  remove: vi.fn(),
  retry: vi.fn(),
  undo: vi.fn(),
}));

vi.mock("./client.js", () => ({
  createResourceAdapterInternalClient: vi.fn(() => ({
    worksheetScaffolding: {
      accept: { mutate: api.accept },
      applySuggestion: { mutate: api.applySuggestion },
      dismiss: { mutate: api.dismiss },
      get: { query: api.get },
      open: { mutate: api.open },
      remove: { mutate: api.remove },
      retry: { mutate: api.retry },
      undo: { mutate: api.undo },
    },
  })),
}));

const adaptationId = "11111111-1111-4111-8111-111111111111";
const attemptId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const contributionId = "44444444-4444-4444-8444-444444444444";
const suggestionId = "55555555-5555-4555-8555-555555555555";

const lesson = {
  availableResources: ["worksheet"],
  keyStageSlug: "ks2",
  lessonSlug: "adding-fractions",
  programmeSlug: "maths-primary-ks2",
  subjectSlug: "maths",
  title: "Adding fractions",
} as const;

const document: ResourceDocument = {
  answers: [],
  assets: [],
  content: [],
  diagnostics: [],
  id: "worksheet",
  language: "en-GB",
  metadata: { title: "Worksheet" },
  profile: "worksheet.v0",
  provenance: {
    producer: { name: "test", version: "1" },
    source: { id: "worksheet", system: "test" },
  },
  schemaVersion: "0.1",
};

const state: WorksheetScaffoldingState = {
  adaptationId,
  document,
  job: null,
  pendingReview: null,
  suggestions: [],
};

const options = {
  apiBaseUrl: "https://resource-adapter.example",
  getToken: () => Promise.resolve("token"),
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const request of Object.values(api)) {
    request.mockResolvedValue(state);
  }
});

describe("worksheet scaffolding client", () => {
  it("opens a worksheet and includes replacement identity only when supplied", async () => {
    api.open.mockResolvedValue({ outcome: "opened", state });

    await openWorksheetScaffolding({ ...options, lesson });
    expect(api.open).toHaveBeenNthCalledWith(1, { lesson });

    const replacing = { adaptationId, requestId };
    await openWorksheetScaffolding({ ...options, lesson, replacing });
    expect(api.open).toHaveBeenNthCalledWith(2, { lesson, replacing });
  });

  it("applies stored parameters by default and forwards an explicit override", async () => {
    await applyWorksheetScaffoldingSuggestion({
      ...options,
      adaptationId,
      suggestionId,
    });
    expect(api.applySuggestion).toHaveBeenNthCalledWith(1, {
      adaptationId,
      suggestionId,
    });

    const params = { supportLevel: "high" };
    await applyWorksheetScaffoldingSuggestion({
      ...options,
      adaptationId,
      params,
      suggestionId,
    });
    expect(api.applySuggestion).toHaveBeenNthCalledWith(2, {
      adaptationId,
      params,
      suggestionId,
    });
  });

  it.each([
    {
      call: () => getWorksheetScaffolding({ ...options, adaptationId }),
      request: api.get,
      value: { adaptationId },
    },
    {
      call: () =>
        acceptWorksheetScaffoldingReview({ ...options, adaptationId, attemptId }),
      request: api.accept,
      value: { adaptationId, attemptId },
    },
    {
      call: () =>
        undoWorksheetScaffoldingReview({ ...options, adaptationId, attemptId }),
      request: api.undo,
      value: { adaptationId, attemptId },
    },
    {
      call: () =>
        retryWorksheetScaffoldingReview({
          ...options,
          adaptationId,
          attemptId,
          requestId,
        }),
      request: api.retry,
      value: { adaptationId, attemptId, requestId },
    },
    {
      call: () =>
        enqueueWorksheetScaffoldingRemoval({
          ...options,
          adaptationId,
          contributionId,
        }),
      request: api.remove,
      value: { adaptationId, contributionId },
    },
    {
      call: () =>
        enqueueWorksheetScaffoldingDismissal({
          ...options,
          adaptationId,
          targetBlockId: "question-1",
        }),
      request: api.dismiss,
      value: { adaptationId, targetBlockId: "question-1" },
    },
  ])("forwards an operation to its internal procedure", async (entry) => {
    await expect(entry.call()).resolves.toBe(state);
    expect(entry.request).toHaveBeenCalledWith(entry.value);
    expect(createResourceAdapterInternalClient).toHaveBeenCalledWith(
      expect.objectContaining(options),
    );
  });

  it("turns a client failure into a stable public error", async () => {
    api.retry.mockRejectedValue(new Error("offline"));

    const result = retryWorksheetScaffoldingReview({
      ...options,
      adaptationId,
      attemptId,
      requestId,
    });

    await expect(result).rejects.toMatchObject({
      message: "Resource Adapter could not retry that scaffold.",
      status: undefined,
    });
    await expect(result).rejects.toBeInstanceOf(ResourceAdapterApiError);
  });
});
