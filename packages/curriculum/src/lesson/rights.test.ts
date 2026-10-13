import { describe, expect, it } from "vitest";
import {
  hasAdaptableRights,
  type LessonRights,
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
const unrestricted: LessonRights = {
  maxRestrictions: [],
  copyrightRestricted: false,
  legacyCopyright: false,
  expired: false,
  geoRestricted: false,
};
describe("adaptable rights", () => {
  it("accepts a lesson with no recorded restrictions", () =>
    expect(hasAdaptableRights(unrestricted)).toBe(true));
  it.each(levels)("%s permits adaptation: %s", (maxLevel, expected) => {
    for (const category of categories) {
      expect(
        hasAdaptableRights({
          ...unrestricted,
          maxRestrictions: [
            { category: "works", maxLevel: "ogl-compatible" },
            { category, maxLevel },
          ],
        }),
      ).toBe(expected);
    }
  });
  it.each(["copyrightRestricted", "legacyCopyright", "expired"] as const)(
    "refuses a lesson marked %s",
    (flag) => expect(hasAdaptableRights({ ...unrestricted, [flag]: true })).toBe(false),
  );
  it("leaves a geo-restricted lesson to the caller", () =>
    expect(hasAdaptableRights({ ...unrestricted, geoRestricted: true })).toBe(true));
});
