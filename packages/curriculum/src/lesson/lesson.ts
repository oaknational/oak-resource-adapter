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
  /** The spoken lesson, where Oak publishes a video for it. */
  transcript: string | null;
  programme: Programme;
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

export type LessonRights = Readonly<{
  maxRestrictions: readonly CategoryMaxRestriction[];
  /** `agf__has_copyright_restrictions` */
  copyrightRestricted: boolean;
  /** `copyright_content` carries Oak's older whole-lesson copyright notice. */
  legacyCopyright: boolean;
  expired: boolean;
  /** `agf__geo_restricted` */
  geoRestricted: boolean;
}>;

const ADAPTABLE_RESTRICTION_LEVELS: ReadonlySet<RestrictionLevel> = new Set([
  "ogl-compatible",
  "ogl-equivalent",
]);

/** The caller must also check geo restrictions against the teacher's region. */
export function hasAdaptableRights(rights: LessonRights): boolean {
  return (
    rights.maxRestrictions.every(({ maxLevel }) =>
      ADAPTABLE_RESTRICTION_LEVELS.has(maxLevel),
    ) &&
    !rights.copyrightRestricted &&
    !rights.legacyCopyright &&
    !rights.expired
  );
}
