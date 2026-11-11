import { describe, expect, it } from "vitest";

import { lessonFacts } from "./test-facts";
import { subjectRule } from "./subject";

describe("subjectRule", () => {
  const rule = subjectRule(
    {
      id: "test",
      label: "Test",
      description: "A rule under test.",
      condition: "Test",
    },
    { subjectSlugs: ["french", "spanish"] },
  );

  it("matches a lesson taught in any listed subject", () => {
    expect(
      rule.check({ facts: lessonFacts({ subjectSlugs: ["english", "spanish"] }) }),
    ).toBe("excluded-subject");
    expect(
      rule.check({ facts: lessonFacts({ subjectSlugs: ["english"] }) }),
    ).toBeNull();
  });

  it("refuses nothing without facts", () => {
    expect(rule.check({ facts: null })).toBeNull();
  });
});
