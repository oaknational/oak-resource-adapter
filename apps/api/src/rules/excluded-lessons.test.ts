import { describe, expect, it } from "vitest";

import { excludedLessonsRule } from "./excluded-lessons";

describe("excludedLessonsRule", () => {
  const rule = excludedLessonsRule(
    {
      id: "test",
      label: "Test",
      description: "A rule under test.",
      condition: "Test",
    },
    { lessonSlugs: ["joining-letters"] },
  );

  it("matches a listed lesson", () => {
    expect(rule.check({ lesson: { lessonSlug: "joining-letters" } })).toBe(
      "excluded-lesson",
    );
    expect(rule.check({ lesson: { lessonSlug: "adding-fractions" } })).toBeNull();
  });

  it("refuses nothing without a lesson", () => {
    expect(rule.check({ lesson: null })).toBeNull();
  });
});
