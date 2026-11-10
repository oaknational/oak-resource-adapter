import {
  buildLesson,
  type LessonEligibilityFacts,
} from "@oaknational/resource-adapter-curriculum";
import { describe, expect, it } from "vitest";

import { lessonRefusal, type LessonRuleContext } from ".";
import { applyLessonMaterialsRule, LESSON_MATERIALS_RULE } from "./lesson-materials";
import { COPYRIGHT_RULE, GEO_RULE, LESSON_STATUS_RULE, SUBJECT_RULE } from "./rules";

const allowed: LessonEligibilityFacts = {
  restrictionLevels: {
    works: ["ogl-compatible"],
    media: ["ogl-equivalent"],
    downloadableFiles: ["ogl-compatible"],
    featureKeys: [],
  },
  subjectSlugs: ["maths"],
  legacy: false,
  contentGuidance: [],
};

const withFeature = (key: string): LessonEligibilityFacts => ({
  ...allowed,
  restrictionLevels: { ...allowed.restrictionLevels!, featureKeys: [key] },
});

const inRegion = { inCopyrightRegion: true };
const outsideRegion = { inCopyrightRegion: false };
const signedOut = undefined;

const refusalOf = (
  facts: LessonEligibilityFacts | null,
  { teacher }: Pick<LessonRuleContext, "teacher"> = { teacher: inRegion },
) => lessonRefusal({ lesson: { lessonSlug: "adding-fractions" }, facts, teacher });

describe("lessonRefusal", () => {
  it("refuses nothing on a lesson no rule applies to, signed in or out", () => {
    for (const teacher of [inRegion, outsideRegion, signedOut]) {
      expect(refusalOf(allowed, { teacher })).toBeNull();
    }
  });

  it("refuses a lesson Oak does not publish in the programme", () => {
    expect(refusalOf(null)).toEqual({
      level: "lesson",
      rule: "lesson-status",
      reason: "unpublished",
    });
  });

  it.each(SUBJECT_RULE.config.subjectSlugs)(
    "refuses a lesson taught in %s, whichever programme it is opened from",
    (slug) => {
      expect(refusalOf({ ...allowed, subjectSlugs: ["maths", slug] })).toEqual({
        level: "lesson",
        rule: "subject",
        reason: "excluded-subject",
      });
    },
  );

  it("refuses a lesson with no published restriction levels", () => {
    expect(refusalOf({ ...allowed, restrictionLevels: null })).toEqual({
      level: "lesson",
      rule: "copyright",
      reason: "no-restriction-levels",
    });
  });

  it.each(COPYRIGHT_RULE.config.conflictFeatureKeys)(
    "refuses a lesson whose features set %s",
    (key) => {
      expect(refusalOf(withFeature(key))).toEqual({
        level: "lesson",
        rule: "copyright",
        reason: "copyright-conflict",
      });
    },
  );

  const categories = [
    ["works", "restricted-works"],
    ["media", "restricted-media"],
    ["downloadableFiles", "restricted-downloadable-files"],
  ] as const;

  it.each(
    COPYRIGHT_RULE.config.restrictedLevels.flatMap((level) =>
      categories.map(([category, reason]) => [level, category, reason] as const),
    ),
  )("refuses %s %s alongside reusable material", (level, category, reason) => {
    const levels = allowed.restrictionLevels!;
    expect(
      refusalOf({
        ...allowed,
        restrictionLevels: { ...levels, [category]: [...levels[category], level] },
      }),
    ).toEqual({ level: "lesson", rule: "copyright", reason });
  });

  it("refuses nothing on Oak's older copyright flags", () => {
    expect(refusalOf(withFeature("agf__has_copyright_restrictions"))).toBeNull();
  });

  it("refuses a geo-restricted lesson only to a signed-in teacher outside a copyright region", () => {
    const geoRestricted = withFeature(GEO_RULE.config.featureKey);

    expect(refusalOf(geoRestricted, { teacher: outsideRegion })).toEqual({
      level: "lesson",
      rule: "geo",
      reason: "outside-copyright-region",
    });
    expect(refusalOf(geoRestricted)).toBeNull();
    expect(refusalOf(geoRestricted, { teacher: signedOut })).toBeNull();
  });

  it("refuses a legacy lesson", () => {
    expect(refusalOf({ ...allowed, legacy: true })).toEqual({
      level: "lesson",
      rule: "lesson-status",
      reason: "legacy",
    });
  });

  it("refuses an expired lesson", () => {
    expect(refusalOf(withFeature(LESSON_STATUS_RULE.config.expiredFeatureKey))).toEqual(
      { level: "lesson", rule: "lesson-status", reason: "expired" },
    );
  });

  it("reports the first rule a lesson fails", () => {
    expect(
      refusalOf(
        {
          ...withFeature("has_copyright_conflict"),
          legacy: true,
          subjectSlugs: ["french"],
        },
        { teacher: outsideRegion },
      ),
    ).toEqual({ level: "lesson", rule: "lesson-status", reason: "legacy" });
  });
});

describe("applyLessonMaterialsRule", () => {
  const transcript = "Today we are going to look at...";

  it.each(LESSON_MATERIALS_RULE.transcriptWithheldSubjectSlugs)(
    "withholds the transcript of a lesson also taught in %s",
    (slug) => {
      expect(
        applyLessonMaterialsRule(
          buildLesson({ transcript, subjectSlugs: ["history", slug] }),
        ).transcript,
      ).toBeNull();
    },
  );

  it("keeps the transcript of a lesson in any other subject", () => {
    expect(
      applyLessonMaterialsRule(buildLesson({ transcript, subjectSlugs: ["history"] }))
        .transcript,
    ).toBe(transcript);
  });
});
