import type { RuleDescription } from "@oaknational/resource-adapter-dev-api-contracts";
import { describe, expect, it } from "vitest";

import { selectionNote } from "./labs-rules-model";

function rule(kind: string, subjectSlugs: readonly string[]): RuleDescription {
  return {
    config: { subjectSlugs },
    condition: "Test",
    id: `${kind}-${subjectSlugs.join("-")}`,
    kind,
    label: "Test",
    reads: ["lesson"],
  };
}

describe("selectionNote", () => {
  const lessonRules = [rule("subject", ["art", "french"])];

  it("notes a selection whose subjects all get no labs links", () => {
    expect(
      selectionNote(
        { rule: rule("subject-key-stage", ["art"]), materials: [] },
        lessonRules,
      ),
    ).toBeDefined();
  });

  it("says nothing while any of its subjects can get labs links", () => {
    expect(
      selectionNote(
        { rule: rule("subject-key-stage", ["art", "computing"]), materials: [] },
        lessonRules,
      ),
    ).toBeUndefined();
  });

  it("says nothing for a selection that doesn't match on subject", () => {
    expect(
      selectionNote({ rule: rule("pe-practical", []), materials: [] }, lessonRules),
    ).toBeUndefined();
  });
});
