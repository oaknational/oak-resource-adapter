import type { LessonResource } from "../resource/resource.js";

export type LessonIdentity = Readonly<{
  lessonSlug: string;
  programmeSlug: string;
}>;

export type Programme = Readonly<{
  examBoard: string | null;
  keyStage: string;
  keyStageSlug: string;
  subject: string;
  subjectSlug: string;
  tier: string | null;
}>;

export type Unit = Readonly<{
  slug: string;
  title: string;
}>;

export type RestrictionLevel =
  "highly-restricted" | "ogl-compatible" | "ogl-equivalent" | "restricted";

export type ThirdPartyMaterialCategory =
  "downloadable-files" | "media" | "quiz-images" | "works";

export type CategoryMaxRestriction = Readonly<{
  category: ThirdPartyMaterialCategory;
  /** The most restrictive level across the lesson's material in this category. */
  maxLevel: RestrictionLevel;
}>;

export type Lesson = Readonly<{
  identity: LessonIdentity;
  title: string;
  programme: Programme;
  unit: Unit;
  resources: readonly LessonResource[];
  contentGuidance: readonly string[];
  maxRestrictions: readonly CategoryMaxRestriction[];
}>;

export interface LessonRepository {
  fetch(identity: LessonIdentity): Promise<Lesson>;
}
