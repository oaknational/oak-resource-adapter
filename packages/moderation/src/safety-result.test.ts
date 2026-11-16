import { describe, expect, it } from "vitest";

import {
  moderationCategoryLabel,
  OTHER_CONTENT_GUIDANCE_LABEL,
} from "./category-labels.js";
import { MODERATION_CATEGORIES, type ModerationCategory } from "./categories.js";
import { isWithheldSafetyResult, safetyResultOf } from "./safety-result.js";

function flagged(
  flaggedCategories: readonly ModerationCategory[],
  unrecognisedCategories: readonly string[] = [],
) {
  return {
    outcome: "FLAGGED" as const,
    flaggedCategories,
    unrecognisedCategories,
    scores: {},
  };
}

describe("safetyResultOf", () => {
  it("is safe when nothing was flagged", () => {
    expect(safetyResultOf({ outcome: "PASSED", scores: {} })).toBe("safe");
  });

  it.each([
    [["p/practical-activities"], [], "guidance-required"],
    [["e/rshe-content", "n/self-harm-suicide"], [], "highly-sensitive"],
    [["n/self-harm-suicide", "t/encourages-harmful-behaviour"], [], "toxic"],
    [[], ["t/a-new-toxic-code"], "toxic"],
    [["p/outdoor-learning"], ["n/a-new-code"], "highly-sensitive"],
    [[], ["x/unknown-group"], "guidance-required"],
  ] as const)(
    "classifies %j with unrecognised %j as %s",
    (flaggedCategories, unrecognised, expected) => {
      expect(safetyResultOf(flagged(flaggedCategories, unrecognised))).toBe(expected);
    },
  );

  it("withholds only highly sensitive and toxic results", () => {
    expect(isWithheldSafetyResult("toxic")).toBe(true);
    expect(isWithheldSafetyResult("highly-sensitive")).toBe(true);
    expect(isWithheldSafetyResult("guidance-required")).toBe(false);
    expect(isWithheldSafetyResult("safe")).toBe(false);
  });
});

describe("moderationCategoryLabel", () => {
  it("names every known category", () => {
    for (const category of MODERATION_CATEGORIES) {
      expect(moderationCategoryLabel(category)).not.toBe(OTHER_CONTENT_GUIDANCE_LABEL);
    }
    expect(moderationCategoryLabel("p/practical-activities")).toBe(
      "Practical equipment and activities",
    );
  });

  it("falls back to the group, then to a generic label", () => {
    expect(moderationCategoryLabel("u/a-new-code")).toBe(
      "Upsetting, disturbing and sensitive",
    );
    expect(moderationCategoryLabel("x/a-new-group")).toBe(OTHER_CONTENT_GUIDANCE_LABEL);
    expect(moderationCategoryLabel("no-prefix")).toBe(OTHER_CONTENT_GUIDANCE_LABEL);
  });
});
