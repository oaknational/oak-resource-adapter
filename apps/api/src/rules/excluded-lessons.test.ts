import { describe, expect, it } from "vitest";

import { excludedLessonsRule } from "./excluded-lessons";
import { lessonFacts } from "./test-facts";

describe("excludedLessonsRule", () => {
  const rule = excludedLessonsRule(
    {
      id: "test",
      label: "Test",
      description: "A rule under test.",
      condition: "Test",
    },
    { lessonSlugs: ["joining-letters"], lessonUids: ["LESS-OIDMT-O3146"] },
  );
  const facts = lessonFacts();

  it("matches a listed lesson", () => {
    expect(rule.check({ facts, lesson: { lessonSlug: "joining-letters" } })).toBe(
      "excluded-lesson",
    );
    expect(
      rule.check({ facts, lesson: { lessonSlug: "adding-fractions" } }),
    ).toBeNull();
  });

  it("matches a listed lesson ID", () => {
    expect(
      rule.check({
        facts: lessonFacts({ lessonUid: "LESS-OIDMT-O3146" }),
        lesson: { lessonSlug: "our-school-from-above" },
      }),
    ).toBe("excluded-lesson");
  });

  it("refuses nothing without a lesson", () => {
    expect(rule.check({ facts: null, lesson: null })).toBeNull();
  });
});
