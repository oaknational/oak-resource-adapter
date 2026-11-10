import { contentGuidanceRule } from "../rules/content-guidance";
import { excludedLessonsRule } from "../rules/excluded-lessons";
import type { Rule } from "../rules/rule";
import { subjectRule } from "../rules/subject";
import type { LessonRuleContext } from "./context";
import { copyrightRule } from "./copyright";
import { geoRule } from "./geo";
import { lessonStatusRule } from "./lesson-status";

export const LESSON_STATUS_RULE = lessonStatusRule(
  {
    id: "lesson-status",
    description:
      "Refuses a lesson Oak does not publish in the programme it is opened from, or one that is legacy or expired.",
  },
  { expiredFeatureKey: "expired" },
);

export const SUBJECT_RULE = subjectRule(
  {
    id: "subject",
    description: "Refuses a lesson taught in a subject not yet cleared for ORA.",
  },
  {
    subjectSlugs: [
      "art",
      "french",
      "geography",
      "german",
      "music",
      "religious-education",
      "spanish",
    ],
  },
);

export const EXCLUDED_LESSONS_RULE = excludedLessonsRule(
  { id: "excluded-lessons", description: "Refuses a listed lesson in any programme." },
  { lessonSlugs: [] },
);

export const CONTENT_GUIDANCE_RULE = contentGuidanceRule(
  {
    id: "content-guidance",
    description: "Refuses a lesson with any listed content guidance.",
  },
  { labels: [] },
);

export const COPYRIGHT_RULE = copyrightRule(
  {
    id: "copyright",
    description:
      "Refuses a lesson with restricted third-party material, a copyright conflict, or no published restriction levels.",
  },
  {
    restrictedLevels: ["restricted", "highly-restricted"],
    conflictFeatureKeys: ["has_copyright_conflict"],
  },
);

export const GEO_RULE = geoRule(
  {
    id: "geo",
    description:
      "Refuses a geo-restricted lesson to a signed-in teacher outside a copyright region.",
  },
  { featureKey: "agf__geo_restricted" },
);

export const LESSON_RULES = [
  LESSON_STATUS_RULE,
  SUBJECT_RULE,
  EXCLUDED_LESSONS_RULE,
  CONTENT_GUIDANCE_RULE,
  COPYRIGHT_RULE,
  GEO_RULE,
] as const satisfies readonly Rule<LessonRuleContext>[];
