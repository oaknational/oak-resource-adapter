import { buildLesson } from "@oaknational/resource-adapter-curriculum";
import {
  resetErrorReporter,
  setErrorReporter,
} from "@oaknational/resource-adapter-logger";
import { afterEach, describe, expect, it } from "vitest";

import {
  listOakMaterial,
  OAK_MATERIAL,
  oakMaterialIsAvailable,
  oakMaterialPromptHeading,
} from "./catalogue";
import { lessonKeywordsFrom } from "./lesson-keywords";
import { OAK_MATERIAL_KEYS, type OakMaterialKey } from "./material";
import { readOakMaterial, renderOakMaterial } from "./requirements";

const keywords = [
  { keyword: "perspective", description: "the position a story is told from" },
];

const withKeywords = buildLesson({ keywords });

describe("the Oak material catalogue", () => {
  it.each(OAK_MATERIAL_KEYS)("describes %s", (key: OakMaterialKey) => {
    expect(OAK_MATERIAL[key].label.trim()).not.toBe("");
  });

  it("explains every part it cannot yet read", () => {
    for (const key of OAK_MATERIAL_KEYS) {
      if (!oakMaterialIsAvailable(key)) {
        expect(OAK_MATERIAL[key].unavailableBecause).toBeDefined();
      }
    }
  });
});

describe("readOakMaterial", () => {
  afterEach(() => {
    resetErrorReporter();
  });

  it("reads a part the lesson carries", async () => {
    expect(
      await readOakMaterial(
        [{ key: "lesson.keywords", required: false }],
        withKeywords,
      ),
    ).toEqual({
      material: { "lesson.keywords": { kind: "keywords", keywords } },
      warnings: [],
    });
  });

  it("warns about an optional part the lesson does not carry", async () => {
    const { material, warnings } = await readOakMaterial(
      [{ key: "lesson.keywords", required: false }],
      buildLesson({ keywords: [] }),
    );

    expect(material).toEqual({});
    expect(warnings[0]).toContain("absent from this lesson");
  });

  it("warns that a part Oak cannot supply at all is missing from a run", async () => {
    const { warnings } = await readOakMaterial(
      [{ key: "lesson.slides", required: false }],
      withKeywords,
    );

    expect(warnings[0]).toContain("not available");
  });

  it("leaves a required part to the caller to reject", async () => {
    expect(
      await readOakMaterial([{ key: "lesson.slides", required: true }], withKeywords),
    ).toEqual({ material: {}, warnings: [] });
  });

  it("derives a transcript summary through the supplied summariser", async () => {
    const summary = {
      learningCycles: [
        {
          title: "Adding fractions",
          cycleOutcome: "Add fractions with the same denominator",
          explanation: ["Fractions need the same denominator before adding."],
          checksForUnderstanding: [],
          practiceTask: ["Add the fractions."],
          feedback: ["Check that the denominator stays the same."],
        },
      ],
      unassignedTranscriptContent: [],
    };
    const resolution = await readOakMaterial(
      [{ key: "lesson.transcriptSummary", required: false }],
      buildLesson({ transcript: "First teach fractions, then add them." }),
      { summariseTranscript: async () => summary },
    );

    expect(resolution).toEqual({
      material: {
        "lesson.transcriptSummary": {
          kind: "transcriptSummary",
          summary,
        },
      },
      warnings: [],
    });
  });

  it("warns when transcript summarisation produces no usable output", async () => {
    const resolution = await readOakMaterial(
      [{ key: "lesson.transcriptSummary", required: false }],
      buildLesson({ transcript: "Teach fractions." }),
      { summariseTranscript: async () => undefined },
    );

    expect(resolution.material).toEqual({});
    expect(resolution.warnings[0]).toContain(
      "could not be built because the summariser returned nothing usable",
    );
  });

  it("reports a failed derivation without losing the parts that resolved", async () => {
    const reportedErrors: unknown[] = [];
    setErrorReporter((error) => reportedErrors.push(error));

    const resolution = await readOakMaterial(
      [
        { key: "lesson.keywords", required: false },
        { key: "lesson.transcriptSummary", required: false },
      ],
      buildLesson({ keywords, transcript: "Teach fractions." }),
      {
        summariseTranscript: async () => {
          throw new Error("the model is unavailable");
        },
      },
    );

    expect(resolution.material).toEqual({
      "lesson.keywords": { kind: "keywords", keywords },
    });
    expect(resolution.warnings[0]).toContain(
      "could not be built because it raised an error",
    );
    expect(reportedErrors).toEqual([new Error("the model is unavailable")]);
  });
});

describe("renderOakMaterial", () => {
  it("renders each part in the order the definition declared", () => {
    const rendered = renderOakMaterial(
      [
        { key: "lesson.outcome", required: false },
        { key: "lesson.keywords", required: false },
      ],
      { "lesson.keywords": { kind: "keywords", keywords } },
    );

    expect(rendered.indexOf("LESSON OUTCOME")).toBeLessThan(
      rendered.indexOf("LESSON KEYWORDS"),
    );
  });

  it("leaves out a part Oak cannot supply, which a definition may still want", () => {
    expect(renderOakMaterial([{ key: "lesson.slides", required: false }], {})).toBe("");
  });

  it("gives Oak's definitions precedence in the keyword block", () => {
    const rendered = renderOakMaterial([{ key: "lesson.keywords", required: false }], {
      "lesson.keywords": { kind: "keywords", keywords },
    });

    expect(rendered).toContain("- perspective: the position a story is told from");
    expect(rendered).toContain("Oak's definition is the one to use");
  });

  it("states an absence rather than omitting the part", () => {
    expect(
      renderOakMaterial([{ key: "lesson.keywords", required: false }], {}),
    ).toContain("Not available for this resource");
  });
});

describe("lessonKeywordsFrom", () => {
  it("reads the keywords a request carries", () => {
    expect(
      lessonKeywordsFrom({ "lesson.keywords": { kind: "keywords", keywords } }),
    ).toEqual(keywords);
  });

  it("reports none when the request carries none", () => {
    expect(lessonKeywordsFrom({})).toEqual([]);
  });
});

describe("listOakMaterial", () => {
  it("lists every part, whether or not it can be read", () => {
    expect(listOakMaterial().map(({ key }) => key)).toEqual([...OAK_MATERIAL_KEYS]);
  });

  it("gives each part the heading it appears under in a prompt", () => {
    expect(listOakMaterial()).toContainEqual({
      available: true,
      key: "lesson.keyLearningPoints",
      label: "Key learning points",
      promptHeading: "KEY LEARNING POINTS",
    });
  });

  it("says why a part that cannot be read is unavailable", () => {
    expect(listOakMaterial().find(({ key }) => key === "lesson.slides")).toMatchObject({
      available: false,
      unavailableBecause: expect.stringContaining("not extracted yet"),
    });
  });
});

describe("the parts a transformation can be given", () => {
  const readable = OAK_MATERIAL_KEYS.filter(oakMaterialIsAvailable);

  it("reads every available part from a lesson that carries it", async () => {
    const lesson = buildLesson({
      keyLearningPoints: ["A fraction names a part of a whole"],
      keywords,
      misconceptions: [
        { misconception: "Adding denominators", response: "Find a common one" },
      ],
      outcome: "I can add fractions",
      transcript: "Today we are adding fractions.",
    });

    const { material, warnings } = await readOakMaterial(
      readable.map((key) => ({ key, required: false })),
      lesson,
      {
        summariseTranscript: async () => ({
          learningCycles: [],
          unassignedTranscriptContent: ["content"],
        }),
      },
    );

    expect(Object.keys(material).sort()).toEqual([...readable].sort());
    expect(warnings).toEqual([]);
  });

  it("renders each available part under its own heading", async () => {
    const lesson = buildLesson({
      keyLearningPoints: ["A fraction names a part of a whole"],
      outcome: "I can add fractions",
    });
    const requirements = [
      { key: "lesson.outcome" as const, required: false },
      { key: "lesson.keyLearningPoints" as const, required: false },
    ];

    const rendered = renderOakMaterial(
      requirements,
      (await readOakMaterial(requirements, lesson)).material,
    );

    expect(rendered).toContain(oakMaterialPromptHeading("lesson.outcome"));
    expect(rendered).toContain(oakMaterialPromptHeading("lesson.keyLearningPoints"));
    expect(rendered).toContain("- A fraction names a part of a whole");
  });
});
