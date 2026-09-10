import { buildLesson } from "@oaknational/resource-adapter-curriculum";
import { beforeEach, describe, expect, it, vi } from "vitest";

const curriculum = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

vi.mock("@oaknational/resource-adapter-curriculum", async () => ({
  createOakLessonRepository: () => ({ fetch: curriculum.fetch }),
  buildLesson: (
    await vi.importActual<typeof import("@oaknational/resource-adapter-curriculum")>(
      "@oaknational/resource-adapter-curriculum",
    )
  ).buildLesson,
  oakCurriculumConfigFromEnv: () => ({
    apiKey: "test-key",
    endpoint: "https://curriculum.example/v1/graphql",
  }),
}));

const model = vi.hoisted(() => ({
  createInvoker: vi.fn(),
  invokeStructured: vi.fn(),
}));

vi.mock("../ai/dev-invoker", () => ({
  createDevModelInvoker: model.createInvoker,
}));

const { getDevLessonMaterial } = await import("./dev-service");

const identity = {
  lessonSlug: "adopting-different-perspectives",
  programmeSlug: "english-primary-ks2",
};

const summary = {
  learningCycles: [
    {
      sequence: 1,
      title: "Identify equivalent fractions",
      cycleOutcome: "Recognise equivalent fractions",
      explanation: ["Equivalent fractions have the same value."],
      checksForUnderstanding: [],
      practiceTask: null,
      feedback: null,
    },
  ],
  unassignedTranscriptContent: [],
};

function partFor(
  parts: Awaited<ReturnType<typeof getDevLessonMaterial>>["parts"],
  key: string,
) {
  const part = parts.find((candidate) => candidate.key === key);
  if (part === undefined) {
    throw new Error(`The response omitted ${key}.`);
  }
  return part;
}

describe("development lesson material", () => {
  beforeEach(() => {
    curriculum.fetch.mockReset();
    model.createInvoker.mockReset();
    model.invokeStructured.mockReset();

    curriculum.fetch.mockResolvedValue(
      buildLesson({
        identity,
        keywords: [{ keyword: "perspective", description: "A point of view." }],
        transcript: "Today we are looking at the same event from two sides.",
      }),
    );
    model.createInvoker.mockReturnValue({ invokeStructured: model.invokeStructured });
    model.invokeStructured.mockResolvedValue({ outcome: "SUCCESS", output: summary });
  });

  it("renders every catalogue part as the text it contributes", async () => {
    const { parts } = await getDevLessonMaterial(identity);

    expect(partFor(parts, "lesson.keywords")).toMatchObject({
      label: "Lesson keywords",
      warnings: [],
    });
    expect(partFor(parts, "lesson.keywords").text).toContain(
      "- perspective: A point of view.",
    );
    expect(partFor(parts, "lesson.transcript").text).toContain(
      "Today we are looking at the same event from two sides.",
    );
    expect(partFor(parts, "lesson.transcriptSummary").text).toContain(
      "Cycle 1: Identify equivalent fractions",
    );
  });

  it("summarises the transcript once for the parts that read it", async () => {
    await getDevLessonMaterial(identity);
    expect(model.invokeStructured).toHaveBeenCalledOnce();
  });

  it("reports a part that did not resolve instead of omitting it", async () => {
    curriculum.fetch.mockResolvedValue(buildLesson({ identity, transcript: null }));

    const { parts } = await getDevLessonMaterial(identity);

    expect(partFor(parts, "lesson.slides")).toMatchObject({
      text: null,
      warnings: [expect.stringContaining("Lesson slides is not available")],
    });
    expect(partFor(parts, "lesson.transcriptSummary")).toMatchObject({
      text: null,
      warnings: [expect.stringContaining("the lesson has no transcript")],
    });
    expect(model.invokeStructured).not.toHaveBeenCalled();
  });
});
