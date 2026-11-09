import type { LessonEligibilityFacts } from "@oaknational/resource-adapter-curriculum";

export type SubjectRule = Readonly<{ excludedSubjectSlugs: readonly string[] }>;

export const SUBJECT_RULE: SubjectRule = {
  excludedSubjectSlugs: [
    "art",
    "french",
    "geography",
    "german",
    "music",
    "religious-education",
    "spanish",
  ],
};

export type SubjectRefusalReason = "no-subject" | "excluded-subject";

export function subjectRefusalReason(
  { subjectSlugs }: LessonEligibilityFacts,
  rule: SubjectRule = SUBJECT_RULE,
): SubjectRefusalReason | null {
  if (subjectSlugs.length === 0) {
    return "no-subject";
  }
  if (subjectSlugs.some((slug) => rule.excludedSubjectSlugs.includes(slug))) {
    return "excluded-subject";
  }
  return null;
}
