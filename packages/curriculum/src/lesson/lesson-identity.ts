import { CurriculumError } from "../errors.js";
import type { LessonIdentity } from "./lesson.js";

const IDENTITY_FIELDS = ["lessonSlug", "programmeSlug"] as const;

export function validateLessonIdentity(identity: LessonIdentity): void {
  const blank = IDENTITY_FIELDS.filter((field) => identity[field].trim() === "");

  if (blank.length > 0) {
    throw new CurriculumError(
      `This is not a lesson identity Oak can be asked about: ${blank.join(" and ")} ${
        blank.length === 1 ? "is" : "are"
      } blank.`,
      { code: "unusable-identity" },
    );
  }
}

export function lessonNotFound(identity: LessonIdentity): CurriculumError {
  return new CurriculumError(
    `Oak publishes no lesson "${identity.lessonSlug}" in programme "${identity.programmeSlug}".`,
    { code: "not-found" },
  );
}
