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
    label: "Is published, current and not expired",
    condition: "The lesson isn't published, is a legacy lesson, or has expired",
    description:
      "Published means published in the programme the lesson is opened from.",
  },
  { expiredFeatureKey: "expired" },
);

export const SUBJECT_RULE = subjectRule(
  {
    id: "subject",
    label: "Isn't in an excluded subject",
    condition: "The lesson is in one of these subjects",
    description:
      "Matches a lesson taught in a listed subject in any of its programmes.",
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
  {
    id: "excluded-lessons",
    label: "Isn't on the excluded lessons list",
    condition: "The lesson is on our list of excluded lessons",
    description: "Matches the lesson in whichever programme it's opened from.",
  },
  { lessonSlugs: [] },
);

export const CONTENT_GUIDANCE_RULE = contentGuidanceRule(
  {
    id: "content-guidance",
    label: "Has no excluded content guidance",
    condition: "The lesson has any of this content guidance",
  },
  { labels: [] },
);

export const COPYRIGHT_RULE = copyrightRule(
  {
    id: "copyright",
    label: "Has no restricted copyright material",
    condition:
      "The lesson has restricted copyright material, a copyright conflict, or no clearance information",
  },
  {
    restrictedLevels: ["restricted", "highly-restricted"],
    conflictFeatureKeys: ["has_copyright_conflict"],
  },
);

export const GEO_RULE = geoRule(
  {
    id: "geo",
    label: "Is available in the teacher's region",
    condition:
      "The lesson is restricted to the UK and Crown dependencies, and the signed-in teacher is elsewhere",
    description:
      "A signed-out visitor isn't refused, so ORA appears and the teacher is refused after signing in.",
  },
  { featureKey: "agf__geo_restricted" },
);

export const LESSON_RULES = [
  LESSON_STATUS_RULE,
  SUBJECT_RULE,
  COPYRIGHT_RULE,
  EXCLUDED_LESSONS_RULE,
  CONTENT_GUIDANCE_RULE,
  GEO_RULE,
] as const satisfies readonly Rule<LessonRuleContext>[];
