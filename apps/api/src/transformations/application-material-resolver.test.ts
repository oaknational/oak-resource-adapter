import { buildLesson } from "@oaknational/resource-adapter-curriculum";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ResourceAdapterModelInvoker } from "../ai/model-roles";

const curriculum = vi.hoisted(() => ({ fetch: vi.fn() }));
const cache = vi.hoisted(() => {
  const rows = new Map<string, unknown>();
  return {
    delete: vi.fn((key: string, summary: unknown) => {
      if (rows.get(key) === summary) rows.delete(key);
      return Promise.resolve();
    }),
    read: vi.fn((key: string) => Promise.resolve(rows.get(key))),
    rows,
    write: vi.fn((row: { key: string; summary: unknown }) => {
      if (!rows.has(row.key)) rows.set(row.key, row.summary);
      return Promise.resolve();
    }),
  };
});

vi.mock("@oaknational/resource-adapter-curriculum", async () => ({
  buildLesson: (
    await vi.importActual<typeof import("@oaknational/resource-adapter-curriculum")>(
      "@oaknational/resource-adapter-curriculum",
    )
  ).buildLesson,
  createOakLessonRepository: () => ({ fetch: curriculum.fetch }),
  oakCurriculumConfigFromEnv: () => ({
    apiKey: "test-key",
    endpoint: "https://curriculum.example/v1/graphql",
  }),
}));

vi.mock("../oak-material/transcript-summary/repository", () => ({
  deleteCachedSummary: cache.delete,
  readCachedSummary: cache.read,
  writeCachedSummary: cache.write,
}));

const { resolveApplicationMaterial } = await import("./application-material-resolver");

const identity = {
  lessonSlug: "adopting-different-perspectives",
  programmeSlug: "english-primary-ks2",
};

const summary = {
  learningCycles: [
    {
      title: "Changing perspective",
      cycleOutcome: "Explain how perspective changes a story",
      explanation: ["Perspective changes whose experience a story presents."],
      checksForUnderstanding: [],
      practiceTask: null,
      feedback: null,
    },
  ],
  unassignedTranscriptContent: [],
};

function invokerReturningSummary() {
  const invokeStructured = vi.fn().mockResolvedValue({
    meta: { invocationId: "11111111-1111-1111-1111-111111111111" },
    outcome: "SUCCESS",
    output: summary,
  });
  const invoker = {
    binding: () => ({ model: "gpt-6-luna", transport: "openai" }),
    invokeStructured,
  } as unknown as ResourceAdapterModelInvoker;
  return { createInvoker: vi.fn(() => invoker), invokeStructured };
}

const titles = [
  { key: "lesson.transcriptSummary.learningCycleTitles" as const, required: false },
];

beforeEach(() => {
  curriculum.fetch.mockReset();
  cache.rows.clear();
  cache.delete.mockClear();
  cache.read.mockClear();
  cache.write.mockClear();
  curriculum.fetch.mockResolvedValue(
    buildLesson({
      identity,
      transcript: "The teacher explains how perspective changes a story.",
    }),
  );
});

describe("resolveApplicationMaterial", () => {
  it("summarises once when multiple transcript summary views are requested", async () => {
    const { createInvoker, invokeStructured } = invokerReturningSummary();

    const resolution = await resolveApplicationMaterial(
      [
        { key: "lesson.transcriptSummary.learningCycleTitles", required: false },
        {
          key: "lesson.transcriptSummary.checksForUnderstanding",
          required: false,
        },
      ],
      identity,
      createInvoker,
    );

    expect(createInvoker).toHaveBeenCalledOnce();
    expect(invokeStructured).toHaveBeenCalledOnce();
    expect(cache.read).toHaveBeenCalledOnce();
    expect(resolution.material).toEqual({
      "lesson.transcriptSummary.learningCycleTitles": {
        kind: "transcriptSummary",
        summary,
      },
      "lesson.transcriptSummary.checksForUnderstanding": {
        kind: "transcriptSummary",
        summary,
      },
    });
  });

  it("reuses the stored summary on a later request", async () => {
    await resolveApplicationMaterial(
      titles,
      identity,
      invokerReturningSummary().createInvoker,
    );
    const later = invokerReturningSummary();

    const resolution = await resolveApplicationMaterial(
      titles,
      identity,
      later.createInvoker,
    );

    expect(later.invokeStructured).not.toHaveBeenCalled();
    expect(resolution.material).toEqual({
      "lesson.transcriptSummary.learningCycleTitles": {
        kind: "transcriptSummary",
        summary,
      },
    });
  });
});
