import { describe, expect, it, vi } from "vitest";

import { defineRule, firstRefusal } from "./rule";

const ruleThat = (id: string, reason: string | null) =>
  defineRule({
    id,
    kind: "test",
    description: "A rule under test.",
    config: {},
    check: vi.fn((): string | null => reason),
  });

describe("firstRefusal", () => {
  it("reports the first rule that refuses, without checking the rest", () => {
    const later = ruleThat("later", "also-refused");
    const rules = [ruleThat("passes", null), ruleThat("refuses", "refused"), later];

    expect(firstRefusal("capability", rules, {})).toEqual({
      level: "capability",
      rule: "refuses",
      reason: "refused",
    });
    expect(later.check).not.toHaveBeenCalled();
  });

  it("refuses nothing when every rule passes", () => {
    expect(firstRefusal("lesson", [ruleThat("passes", null)], {})).toBeNull();
  });
});
