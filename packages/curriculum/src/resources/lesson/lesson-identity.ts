import { CurriculumError } from "./errors.js";

export function validateLessonIdentity(
  lessonSlug: string,
  programmeSlug: string,
): void {
  if (!lessonSlug || lessonSlug.trim() === "") {
    throw new CurriculumError(
      "This is not a lesson identity Oak can be asked about: lessonSlug is blank",
      { code: "unusable-identity" },
    );
  }
  if (!programmeSlug || programmeSlug.trim() === "") {
    throw new CurriculumError(
      "This is not a lesson identity Oak can be asked about: programmeSlug is blank",
      { code: "unusable-identity" },
    );
  }
}
