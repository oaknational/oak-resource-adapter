import { CurriculumError } from "../errors.js";

export type LessonResourceType =
  | "exit-quiz"
  | "exit-quiz-answers"
  | "lesson-guide"
  | "slide-deck"
  | "starter-quiz"
  | "starter-quiz-answers"
  | "supplementary"
  | "worksheet"
  | "worksheet-answers";

/** An object in Oak's own storage, which is private. Quizzes have their own bucket. */
export type ResourceFileLocation = Readonly<{
  bucketName: string;
  bucketPath: string;
}>;

/**
 * Oak keeps each resource as a file in its storage and, for everything but the
 * quizzes, as a Google Drive document. Neither is guaranteed: a resource can be
 * published with only one.
 */
export type LessonResource = Readonly<{
  type: LessonResourceType;
  pdf: ResourceFileLocation | null;
  googleDriveUrl: string | null;
}>;

export type ResourceFile = Readonly<{
  bytes: Uint8Array;
  contentType: string;
  type: LessonResourceType;
}>;

/** The part of a `Lesson` a store needs, so a caller can pass a whole one. */
export type LessonWithResources = Readonly<{
  identity: Readonly<{ lessonSlug: string }>;
  resources: readonly LessonResource[];
}>;

/**
 * Oak's downloads API is keyed by lesson and resource kind rather than by file
 * location, so a read needs the lesson it belongs to.
 */
export interface ResourceStore {
  fetch(lesson: LessonWithResources, type: LessonResourceType): Promise<ResourceFile>;
}

export function findLessonResource(
  lesson: LessonWithResources,
  type: LessonResourceType,
): LessonResource | undefined {
  return lesson.resources.find((resource) => resource.type === type);
}

export function resourceUnavailable(
  lesson: LessonWithResources,
  type: LessonResourceType,
): CurriculumError {
  return new CurriculumError(
    `Oak publishes no ${type} for lesson "${lesson.identity.lessonSlug}".`,
    { code: "unavailable-resource" },
  );
}
