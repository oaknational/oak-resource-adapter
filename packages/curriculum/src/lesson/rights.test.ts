import { describe, expect, it } from "vitest";
import {
  hasAdaptableRights,
  type RestrictionLevel,
  type ThirdPartyMaterialCategory,
} from "./lesson.js";

const levels: readonly [RestrictionLevel, boolean][] = [
  ["ogl-compatible", true],
  ["ogl-equivalent", true],
  ["restricted", false],
  ["highly-restricted", false],
];
const categories: readonly ThirdPartyMaterialCategory[] = [
  "works",
  "media",
  "quiz-images",
  "downloadable-files",
];
describe("adaptable rights", () => {
  it("accepts a lesson with no recorded restrictions", () =>
    expect(hasAdaptableRights([])).toBe(true));
  it.each(levels)("%s permits adaptation: %s", (maxLevel, expected) => {
    for (const category of categories) {
      expect(
        hasAdaptableRights([
          { category: "works", maxLevel: "ogl-compatible" },
          { category, maxLevel },
        ]),
      ).toBe(expected);
    }
  });
});
