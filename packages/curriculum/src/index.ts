export { oakCurriculumConfigFromEnv, oakResourceStoreConfigFromEnv } from "./config.js";
export type { OakCurriculumConfig, OakResourceStoreConfig } from "./config.js";
export { CurriculumError } from "./errors.js";
export type { CurriculumErrorCode } from "./errors.js";
export {
  buildLesson,
  createInMemoryLessonRepository,
} from "./lesson/in-memory-lesson-repository.js";
export type {
  Lesson,
  LessonIdentity,
  LessonKeyword,
  LessonMisconception,
  LessonRepository,
  LessonRestrictionLevels,
  LessonEligibilityFacts,
  Programme,
  RestrictionLevel,
  Unit,
} from "./lesson/lesson.js";
export { createOakLessonRepository } from "./lesson/oak-lesson-repository.js";
export {
  buildResourceFile,
  createInMemoryResourceStore,
  resourceKey,
} from "./resource/in-memory-resource-store.js";
export { createOakResourceStore } from "./resource/oak-resource-store.js";
export { findLessonResource } from "./resource/resource.js";
export type {
  LessonResource,
  LessonResourceType,
  LessonWithResources,
  ResourceFile,
  ResourceStore,
} from "./resource/resource.js";

export { createOakLessonEligibilityFactsReader } from "./lesson/oak-lesson-repository.js";
