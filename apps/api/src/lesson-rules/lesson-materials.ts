import type { Lesson } from "@oaknational/resource-adapter-curriculum";

export type LessonMaterialsRule = Readonly<{
  id: string;
  description: string;
  config: Readonly<{ transcriptWithheldSubjectSlugs: readonly string[] }>;
}>;

export const LESSON_MATERIALS_RULE: LessonMaterialsRule = {
  id: "transcript",
  description: "Withholds the transcript of a lesson taught in a listed subject.",
  config: { transcriptWithheldSubjectSlugs: ["english"] },
};

/**
 * Withholds the transcript itself rather than the parts read from it, so no
 * summary is generated from a withheld transcript.
 */
export function applyLessonMaterialsRule(
  lesson: Lesson,
  rule: LessonMaterialsRule = LESSON_MATERIALS_RULE,
): Lesson {
  const withheld = lesson.subjectSlugs.some((slug) =>
    rule.config.transcriptWithheldSubjectSlugs.includes(slug),
  );
  return withheld ? { ...lesson, transcript: null } : lesson;
}
