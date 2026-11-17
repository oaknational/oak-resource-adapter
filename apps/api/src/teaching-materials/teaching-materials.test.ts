import type { LessonEligibilityFacts } from "@oaknational/resource-adapter-curriculum";
import { describe, expect, it } from "vitest";

import { lessonFacts } from "../rules/test-facts";
import { selectTeachingMaterials, teachingMaterialsFor } from ".";

const ALL = [
  "additional-glossary",
  "additional-comprehension",
  "additional-starter-quiz",
  "additional-exit-quiz",
];
const WITHOUT_COMPREHENSION = [
  "additional-glossary",
  "additional-starter-quiz",
  "additional-exit-quiz",
];
const QUIZZES_ONLY = ["additional-starter-quiz", "additional-exit-quiz"];

const unrestricted = { works: [], media: [], downloadableFiles: [], featureKeys: [] };

function opened(
  subjectSlug: string,
  keyStageSlug: string,
  overrides: Partial<LessonEligibilityFacts> = {},
): LessonEligibilityFacts {
  return lessonFacts({
    programme: { subjectSlug, keyStageSlug },
    subjectSlugs: [subjectSlug],
    restrictionLevels: unrestricted,
    ...overrides,
  });
}

describe("selectTeachingMaterials", () => {
  it.each([
    ["an unlisted subject", opened("english", "ks2"), ALL],
    ["a listed subject at an unlisted key stage", opened("maths", "ks5"), ALL],
    ["art at KS1", opened("art", "ks1"), WITHOUT_COMPREHENSION],
    [
      "art at KS4",
      opened("art", "ks4"),
      ["additional-glossary", "additional-comprehension", "additional-starter-quiz"],
    ],
    ["maths at KS2", opened("maths", "ks2"), WITHOUT_COMPREHENSION],
    [
      "financial education at KS3",
      opened("financial-education", "ks3"),
      WITHOUT_COMPREHENSION,
    ],
    [
      "digital literacy at KS4",
      opened("digital-literacy", "ks4"),
      WITHOUT_COMPREHENSION,
    ],
    ["computing at KS1", opened("computing", "ks1"), WITHOUT_COMPREHENSION],
    ["RE at KS1", opened("religious-education", "ks1"), WITHOUT_COMPREHENSION],
    ["Spanish at KS2", opened("spanish", "ks2"), QUIZZES_ONLY],
    ["Spanish at KS3", opened("spanish", "ks3"), QUIZZES_ONLY],
    ["German at KS4", opened("german", "ks4"), QUIZZES_ONLY],
    ["cooking and nutrition at KS1", opened("cooking-nutrition", "ks1"), ALL],
    ["music at KS1", opened("music", "ks1"), ALL],
    [
      "a handwriting lesson",
      opened("english", "ks1", { subjectCategories: ["Handwriting"] }),
      ["additional-glossary", "additional-starter-quiz"],
    ],
    [
      "a spelling lesson",
      opened("english", "ks2", { subjectCategories: ["Spelling"] }),
      WITHOUT_COMPREHENSION,
    ],
    [
      "a practical PE lesson",
      opened("physical-education", "ks2", { pePractical: true }),
      WITHOUT_COMPREHENSION,
    ],
  ])("gives %s the materials OWA does", (_, facts, materials) => {
    expect(selectTeachingMaterials({ facts })).toEqual(materials);
  });

  it("lets a subject category decide before the subject and key stage", () => {
    expect(
      selectTeachingMaterials({
        facts: opened("french", "ks3", { subjectCategories: ["Spelling"] }),
      }),
    ).toEqual(WITHOUT_COMPREHENSION);
  });

  it("lets handwriting decide before spelling", () => {
    expect(
      selectTeachingMaterials({
        facts: opened("english", "ks1", {
          subjectCategories: ["Handwriting", "Spelling"],
        }),
      }),
    ).toEqual(["additional-glossary", "additional-starter-quiz"]);
  });

  it("lets practical PE decide before the subject and key stage", () => {
    expect(
      selectTeachingMaterials({ facts: opened("art", "ks4", { pePractical: true }) }),
    ).toEqual(WITHOUT_COMPREHENSION);
  });
});

describe("teachingMaterialsFor", () => {
  const lesson = { lessonSlug: "adding-fractions" };
  const materialsFor = (facts: LessonEligibilityFacts | null) =>
    teachingMaterialsFor({ facts, lesson });

  it("gives a lesson no rule refuses its selected materials", () => {
    expect(materialsFor(opened("maths", "ks2"))).toEqual(WITHOUT_COMPREHENSION);
  });

  it.each<[string, LessonEligibilityFacts | null]>([
    ["isn't published in the programme", null],
    ["is a legacy lesson", opened("maths", "ks2", { legacy: true })],
    [
      "has expired",
      opened("maths", "ks2", {
        restrictionLevels: { ...unrestricted, featureKeys: ["expired"] },
      }),
    ],
    ["is in a subject ORA excludes", opened("art", "ks1")],
    [
      "has no clearance information",
      opened("maths", "ks2", { restrictionLevels: null }),
    ],
    [
      "has a copyright conflict",
      opened("maths", "ks2", {
        restrictionLevels: { ...unrestricted, featureKeys: ["has_copyright_conflict"] },
      }),
    ],
    [
      "has restricted works",
      opened("maths", "ks2", {
        restrictionLevels: { ...unrestricted, works: ["highly-restricted"] },
      }),
    ],
    ["is on OWA's list", opened("maths", "ks2", { lessonUid: "LESS-OIDMT-O3146" })],
    [
      "has restricted content guidance",
      opened("maths", "ks2", {
        contentGuidance: ["Depiction or discussion of serious crime"],
      }),
    ],
  ])("gives nothing to a lesson that %s", (_, facts) => {
    expect(materialsFor(facts)).toEqual([]);
  });

  it("still gives materials to a lesson with restricted media or downloadable files", () => {
    expect(
      materialsFor(
        opened("maths", "ks2", {
          restrictionLevels: {
            ...unrestricted,
            media: ["restricted"],
            downloadableFiles: ["highly-restricted"],
          },
        }),
      ),
    ).toEqual(WITHOUT_COMPREHENSION);
  });
});
