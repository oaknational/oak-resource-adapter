import { describe, expect, it } from "vitest";

import { lessonFacts } from "./test-facts";
import { subjectCategoryRule } from "./subject-category";

describe("subjectCategoryRule", () => {
  const rule = subjectCategoryRule(
    { id: "test", label: "Test", condition: "Test" },
    { categories: ["Handwriting", "Spelling"] },
  );

  it("matches a lesson in any listed category", () => {
    expect(
      rule.check({
        facts: lessonFacts({ subjectCategories: ["Grammar", "Spelling"] }),
      }),
    ).toBe("excluded-subject-category");
    expect(
      rule.check({ facts: lessonFacts({ subjectCategories: ["Grammar"] }) }),
    ).toBeNull();
  });

  it("refuses nothing without facts", () => {
    expect(rule.check({ facts: null })).toBeNull();
  });
});
