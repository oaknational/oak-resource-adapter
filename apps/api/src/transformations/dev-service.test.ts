import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { QuestionNode, ResourceDocument } from "@oaknational/resource-document";

const curriculum = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock("@oaknational/resource-adapter-curriculum", () => ({
  createOakLessonRepository: () => ({ fetch: curriculum.fetch }),
  oakCurriculumConfigFromEnv: () => ({
    apiKey: "test-key",
    endpoint: "https://curriculum.example/v1/graphql",
  }),
}));

const { getDevTransformationCatalogue, previewDevTransformation } =
  await import("./dev-service");

const lesson = {
  lessonSlug: "adopting-different-perspectives",
  programmeSlug: "english-primary-ks2",
};

let worksheet: ResourceDocument;
let question: QuestionNode;

function command(overrides: Record<string, unknown> = {}) {
  return {
    document: worksheet,
    kind: "scaffold-add-glossary-question",
    lesson,
    params: { supportLevel: "low" },
    targetBlockId: question.id,
    ...overrides,
  };
}

beforeAll(async () => {
  worksheet = await originalResourceDocuments.get({
    source: "oak",
    ...lesson,
    resourceType: "worksheet",
  });
  const first = worksheet.content.find(
    (node): node is QuestionNode => node.type === "question",
  );
  if (first === undefined) {
    throw new Error("The fixture has no question.");
  }
  question = first;
});

beforeEach(() => {
  curriculum.fetch.mockReset();
});

describe("getDevTransformationCatalogue", () => {
  it("serves both catalogues the harness renders", () => {
    const catalogue = getDevTransformationCatalogue();

    expect(catalogue.transformations.length).toBeGreaterThan(0);
    expect(catalogue.material.map(({ key }) => key)).toContain("lesson.keywords");
  });
});

describe("previewDevTransformation", () => {
  it("renders a prompt from the lesson material Oak supplied", async () => {
    curriculum.fetch.mockResolvedValue({
      keywords: [{ keyword: "perspective", description: "whose eyes we see through" }],
    });

    const preview = await previewDevTransformation(command());

    expect(preview.prompt?.text).toContain("whose eyes we see through");
  });

  it("warns about a part Oak cannot supply rather than failing", async () => {
    curriculum.fetch.mockResolvedValue({ keywords: [] });

    const preview = await previewDevTransformation(command());

    expect(preview.warnings.join(" ")).toContain("Lesson slides is not available");
  });

  it("warns rather than failing when the lesson cannot be fetched at all", async () => {
    curriculum.fetch.mockRejectedValue(new Error("Oak is unwell"));

    const preview = await previewDevTransformation(command());

    expect(preview.warnings.join(" ")).toContain("could not be resolved");
  });

  it("reports no lesson as a warning, since this transformation requires none", async () => {
    const preview = await previewDevTransformation(command({ lesson: undefined }));

    expect(curriculum.fetch).not.toHaveBeenCalled();
    expect(preview.warnings.join(" ")).toContain("No lesson was supplied");
  });
});
