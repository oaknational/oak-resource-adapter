import type { Lesson } from "@oaknational/resource-adapter-curriculum";

import { readableSlug } from "../rules/rule-presentation";

export type LessonMaterialsRule = Readonly<{
  id: string;
  label: string;
  description?: string;
  condition: string;
  config: Readonly<{ transcriptWithheldSubjectSlugs: readonly string[] }>;
  displayValues: readonly string[];
}>;

const transcriptWithheldSubjectSlugs = ["english"];

export const LESSON_MATERIALS_RULE: LessonMaterialsRule = {
  id: "transcript",
  label: "Reads the transcript only outside listed subjects",
  condition: "The transcript, if the lesson is in one of these subjects",
  description: "No summary is made from a transcript ORA leaves out.",
  config: { transcriptWithheldSubjectSlugs },
  displayValues: transcriptWithheldSubjectSlugs.map(readableSlug),
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
