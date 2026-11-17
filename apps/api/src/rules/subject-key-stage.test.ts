import { describe, expect, it } from "vitest";

import { lessonFacts } from "./test-facts";
import { subjectKeyStageRule } from "./subject-key-stage";

describe("subjectKeyStageRule", () => {
  const rule = subjectKeyStageRule(
    { id: "test", label: "Test", condition: "Test" },
    { subjectSlugs: ["maths"], keyStageSlugs: ["ks1", "ks2"] },
  );

  it("matches a listed subject at a listed key stage", () => {
    expect(
      rule.check({
        facts: lessonFacts({
          programme: { subjectSlug: "maths", keyStageSlug: "ks2" },
        }),
      }),
    ).toBe("subject-key-stage");
  });

  it("reads the opened programme, not the lesson's other subjects", () => {
    expect(
      rule.check({
        facts: lessonFacts({
          programme: { subjectSlug: "science", keyStageSlug: "ks2" },
          subjectSlugs: ["maths", "science"],
        }),
      }),
    ).toBeNull();
  });

  it("needs both the subject and the key stage to match", () => {
    expect(
      rule.check({
        facts: lessonFacts({
          programme: { subjectSlug: "maths", keyStageSlug: "ks3" },
        }),
      }),
    ).toBeNull();
  });

  it("matches nothing without facts", () => {
    expect(rule.check({ facts: null })).toBeNull();
  });
});
