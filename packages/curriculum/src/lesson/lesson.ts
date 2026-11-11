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

/** A word the lesson teaches, with Oak's own definition of it. */
export type LessonKeyword = Readonly<{
  keyword: string;
  description: string;
}>;

/** A mistake Oak expects pupils to make, and how a teacher answers it. */
export type LessonMisconception = Readonly<{
  misconception: string;
  response: string;
}>;

export type Unit = Readonly<{
  slug: string;
  title: string;
}>;

export type RestrictionLevel =
  "highly-restricted" | "ogl-compatible" | "ogl-equivalent" | "restricted";

export type Lesson = Readonly<{
  identity: LessonIdentity;
  title: string;
  /** The spoken lesson, where Oak publishes a video for it. */
  transcript: string | null;
  programme: Programme;
  /** Every subject the lesson is taught in, across all its programmes. */
  subjectSlugs: readonly string[];
  unit: Unit;
  resources: readonly LessonResource[];
  contentGuidance: readonly string[];
  keyLearningPoints: readonly string[];
  keywords: readonly LessonKeyword[];
  misconceptions: readonly LessonMisconception[];
  /** What a pupil should be able to say they can do, in Oak's own words. */
  outcome: string | null;
}>;

export interface LessonRepository {
  fetch(identity: LessonIdentity): Promise<Lesson>;
}

/**
 * Every published restriction-levels row combined: a lesson is as restricted as
 * all its rows together.
 */
export type LessonRestrictionLevels = Readonly<{
  works: readonly RestrictionLevel[];
  media: readonly RestrictionLevel[];
  downloadableFiles: readonly RestrictionLevel[];
  /** `features` keys present and not `false`, as the data team's `_has_key` query reads them. */
  featureKeys: readonly string[];
}>;

export type LessonEligibilityFacts = Readonly<{
  /** `null` when Oak publishes no restriction levels for the lesson. */
  restrictionLevels: LessonRestrictionLevels | null;
  /** Every subject the lesson is taught in, across all its programmes. */
  subjectSlugs: readonly string[];
  /** Every unit's subject categories, across all its programmes. */
  subjectCategories: readonly string[];
  legacy: boolean;
  contentGuidance: readonly string[];
}>;
