import { describe, expect, it } from "vitest";

import { contentGuidanceRule } from "./content-guidance";
import { lessonFacts } from "./test-facts";

describe("contentGuidanceRule", () => {
  const rule = contentGuidanceRule(
    {
      id: "test",
      label: "Test",
      description: "A rule under test.",
      condition: "Test",
    },
    { labels: ["Depiction or discussion of serious crime"] },
  );

  it("matches a lesson with a listed label, exactly as Oak publishes it", () => {
    expect(
      rule.check({
        facts: lessonFacts({
          contentGuidance: [
            "Depiction or discussion of discriminatory behaviour",
            "Depiction or discussion of serious crime",
          ],
        }),
      }),
    ).toBe("content-guidance");
    expect(
      rule.check({
        facts: lessonFacts({
          contentGuidance: ["depiction or discussion of serious crime"],
        }),
      }),
    ).toBeNull();
  });

  it("refuses nothing without facts", () => {
    expect(rule.check({ facts: null })).toBeNull();
  });
});
