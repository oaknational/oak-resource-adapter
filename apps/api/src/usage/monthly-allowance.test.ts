import { describe, expect, it } from "vitest";

import { adaptedResourcesPerMonthLimit } from "./monthly-allowance";

describe("the adapted resources per month limit", () => {
  it("falls back to 3 when unset", () => {
    expect(adaptedResourcesPerMonthLimit(undefined)).toBe(3);
  });

  it("refuses a value that is not a positive integer", () => {
    expect(() => adaptedResourcesPerMonthLimit("0")).toThrow(
      "USAGE_LIMIT_ADAPTED_RESOURCES_PER_MONTH must be a positive integer.",
    );
  });
});
