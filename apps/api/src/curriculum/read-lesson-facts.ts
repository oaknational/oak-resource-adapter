import {
  createOakLessonEligibilityFactsReader,
  oakCurriculumConfigFromEnv,
  type LessonEligibilityFacts,
  type LessonIdentity,
} from "@oaknational/resource-adapter-curriculum";

export async function readLessonFacts(
  lesson: LessonIdentity | undefined,
): Promise<LessonEligibilityFacts | null> {
  return lesson === undefined
    ? null
    : createOakLessonEligibilityFactsReader(oakCurriculumConfigFromEnv(process.env))(
        lesson,
      );
}
