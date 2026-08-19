import { buildLesson } from "@oaknational/resource-adapter-curriculum";
import { describe, expect, it } from "vitest";

import {
  listOakMaterial,
  OAK_MATERIAL,
  oakMaterialIsAvailable,
  oakMaterialPromptHeading,
} from "./catalogue";
import { lessonKeywordsFrom } from "./lesson-keywords";
import { OAK_MATERIAL_KEYS } from "./material";
import {
  assertRequiredMaterial,
  readOakMaterial,
  renderOakMaterial,
} from "./requirements";

const keywords = [
  { keyword: "perspective", description: "the position a story is told from" },
];

const withKeywords = buildLesson({ keywords });

describe("the Oak material catalogue", () => {
  it.each(OAK_MATERIAL_KEYS)("describes %s", (key) => {
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
  it("reads a part the lesson carries", () => {
    expect(
      readOakMaterial([{ key: "lesson.keywords", required: false }], withKeywords),
    ).toEqual({
      material: { "lesson.keywords": { kind: "keywords", keywords } },
      warnings: [],
    });
  });

  it("warns about an optional part the lesson does not carry", () => {
    const { material, warnings } = readOakMaterial(
      [{ key: "lesson.keywords", required: false }],
      buildLesson({ keywords: [] }),
    );

    expect(material).toEqual({});
    expect(warnings[0]).toContain("absent from this lesson");
  });

  it("warns that a part Oak cannot supply at all is missing from a run", () => {
    const { warnings } = readOakMaterial(
      [{ key: "lesson.slides", required: false }],
      withKeywords,
    );

    expect(warnings[0]).toContain("not available");
  });

  it("leaves a required part to the caller to reject", () => {
    expect(
      readOakMaterial([{ key: "lesson.slides", required: true }], withKeywords),
    ).toEqual({ material: {}, warnings: [] });
  });
});

describe("assertRequiredMaterial", () => {
  it("accepts a request carrying what a kind requires", () => {
    expect(() =>
      assertRequiredMaterial(
        "test-kind",
        [{ key: "lesson.keywords", required: true }],
        { "lesson.keywords": { kind: "keywords", keywords } },
      ),
    ).not.toThrow();
  });

  it("rejects a request missing a required part, and says why it is missing", () => {
    expect(() =>
      assertRequiredMaterial(
        "test-kind",
        [{ key: "lesson.slides", required: true }],
        {},
      ),
    ).toThrow(/lesson\.slides \(Slide content is not extracted yet/);
  });

  it("ignores an absent optional part", () => {
    expect(() =>
      assertRequiredMaterial(
        "test-kind",
        [{ key: "lesson.keywords", required: false }],
        {},
      ),
    ).not.toThrow();
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

  it("reads every available part from a lesson that carries it", () => {
    const lesson = buildLesson({
      keyLearningPoints: ["A fraction names a part of a whole"],
      keywords,
      misconceptions: [
        { misconception: "Adding denominators", response: "Find a common one" },
      ],
      outcome: "I can add fractions",
      transcript: "Today we are adding fractions.",
    });

    const { material, warnings } = readOakMaterial(
      readable.map((key) => ({ key, required: false })),
      lesson,
    );

    expect(Object.keys(material).sort()).toEqual([...readable].sort());
    expect(warnings).toEqual([]);
  });

  it("renders each available part under its own heading", () => {
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
      readOakMaterial(requirements, lesson).material,
    );

    expect(rendered).toContain(oakMaterialPromptHeading("lesson.outcome"));
    expect(rendered).toContain(oakMaterialPromptHeading("lesson.keyLearningPoints"));
    expect(rendered).toContain("- A fraction names a part of a whole");
  });
});
