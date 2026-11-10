import { describe, expect, it } from "vitest";

import { resourceInputsRule } from "./resource-inputs";

describe("resourceInputsRule", () => {
  const rule = resourceInputsRule(
    { id: "resource-inputs", description: "A rule under test." },
    { resourceType: "worksheet" },
  );
  const check = (
    originalFileResourceTypes: string[],
    extractedResourceTypes: string[],
  ) => rule.check({ originalFileResourceTypes, extractedResourceTypes });

  it("says which input is missing", () => {
    expect(check([], ["worksheet"])).toBe("no-original-file");
    expect(check(["worksheet"], [])).toBe("not-extracted");
    expect(check(["worksheet"], ["worksheet"])).toBeNull();
  });
});
