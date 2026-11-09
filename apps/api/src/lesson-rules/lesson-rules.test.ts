import {
  buildLesson,
  type LessonEligibilityFacts,
} from "@oaknational/resource-adapter-curriculum";
import { describe, expect, it } from "vitest";

import { lessonRefusal } from ".";
import { COPYRIGHT_RULE } from "./copyright";
import { GEO_RULE } from "./geo";
import { applyLessonMaterialsRule, LESSON_MATERIALS_RULE } from "./lesson-materials";
import { LESSON_STATUS_RULE } from "./lesson-status";
import { SUBJECT_RULE } from "./subject";

const allowed: LessonEligibilityFacts = {
  restrictionLevels: {
    works: ["ogl-compatible"],
    media: ["ogl-equivalent"],
    downloadableFiles: ["ogl-compatible"],
    featureKeys: [],
  },
  subjectSlugs: ["maths"],
  legacy: false,
};

const withFeature = (key: string): LessonEligibilityFacts => ({
  ...allowed,
  restrictionLevels: { ...allowed.restrictionLevels!, featureKeys: [key] },
});

const inRegion = { inCopyrightRegion: true };
const outsideRegion = { inCopyrightRegion: false };
const signedOut = undefined;

describe("lessonRefusal", () => {
  it("refuses nothing on a lesson no rule applies to, signed in or out", () => {
    for (const teacher of [inRegion, outsideRegion, signedOut]) {
      expect(lessonRefusal(allowed, teacher)).toBeNull();
    }
  });

  it("refuses a lesson Oak does not publish in the programme", () => {
    expect(lessonRefusal(null, inRegion)).toEqual({
      rule: "lesson-status",
      reason: "unpublished",
    });
  });

  it.each(SUBJECT_RULE.excludedSubjectSlugs)(
    "refuses a lesson taught in %s, whichever programme it is opened from",
    (slug) => {
      expect(
        lessonRefusal({ ...allowed, subjectSlugs: ["maths", slug] }, inRegion),
      ).toEqual({ rule: "subject", reason: "excluded-subject" });
    },
  );

  it("refuses a lesson taught in no subject", () => {
    expect(lessonRefusal({ ...allowed, subjectSlugs: [] }, inRegion)).toEqual({
      rule: "subject",
      reason: "no-subject",
    });
  });

  it("refuses a lesson with no published restriction levels", () => {
    expect(lessonRefusal({ ...allowed, restrictionLevels: null }, inRegion)).toEqual({
      rule: "copyright",
      reason: "no-restriction-levels",
    });
  });

  it.each(COPYRIGHT_RULE.conflictFeatureKeys)(
    "refuses a lesson whose features set %s",
    (key) => {
      expect(lessonRefusal(withFeature(key), inRegion)).toEqual({
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
    COPYRIGHT_RULE.restrictedLevels.flatMap((level) =>
      categories.map(([category, reason]) => [level, category, reason] as const),
    ),
  )("refuses %s %s alongside reusable material", (level, category, reason) => {
    const levels = allowed.restrictionLevels!;
    expect(
      lessonRefusal(
        {
          ...allowed,
          restrictionLevels: { ...levels, [category]: [...levels[category], level] },
        },
        inRegion,
      ),
    ).toEqual({ rule: "copyright", reason });
  });

  it("refuses nothing on Oak's older copyright flags", () => {
    expect(
      lessonRefusal(withFeature("agf__has_copyright_restrictions"), inRegion),
    ).toBeNull();
  });

  it("refuses a geo-restricted lesson only to a signed-in teacher outside a copyright region", () => {
    const geoRestricted = withFeature(GEO_RULE.featureKey);

    expect(lessonRefusal(geoRestricted, outsideRegion)).toEqual({
      rule: "geo",
      reason: "outside-copyright-region",
    });
    expect(lessonRefusal(geoRestricted, inRegion)).toBeNull();
    expect(lessonRefusal(geoRestricted, signedOut)).toBeNull();
  });

  it("refuses a legacy lesson", () => {
    expect(lessonRefusal({ ...allowed, legacy: true }, inRegion)).toEqual({
      rule: "lesson-status",
      reason: "legacy",
    });
  });

  it("refuses an expired lesson", () => {
    expect(
      lessonRefusal(withFeature(LESSON_STATUS_RULE.expiredFeatureKey), inRegion),
    ).toEqual({ rule: "lesson-status", reason: "expired" });
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
