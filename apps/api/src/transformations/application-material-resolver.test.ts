import { buildLesson } from "@oaknational/resource-adapter-curriculum";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ResourceAdapterModelInvoker } from "../ai/model-roles";

const curriculum = vi.hoisted(() => ({ fetch: vi.fn() }));

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

const { resolveApplicationMaterial } = await import("./application-material-resolver");

const identity = {
  lessonSlug: "adopting-different-perspectives",
  programmeSlug: "english-primary-ks2",
};

beforeEach(() => {
  curriculum.fetch.mockReset();
});

describe("resolveApplicationMaterial", () => {
  it("summarises once when multiple transcript summary views are requested", async () => {
    curriculum.fetch.mockResolvedValue(
      buildLesson({
        identity,
        transcript: "The teacher explains how perspective changes a story.",
      }),
    );
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
    const invokeStructured = vi.fn().mockResolvedValue({
      meta: { invocationId: "11111111-1111-1111-1111-111111111111" },
      outcome: "SUCCESS",
      output: summary,
    });
    const createInvoker = vi.fn(
      () => ({ invokeStructured }) as unknown as ResourceAdapterModelInvoker,
    );

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
});
