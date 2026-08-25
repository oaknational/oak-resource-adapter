import type { Lesson, LessonKeyword } from "@oaknational/resource-adapter-curriculum";

/**
 * The parts of Oak's own content a transformation can ask to be sent alongside
 * the resource it is changing. A key names a granularity as much as a subject:
 * once Oak publishes semantic slides, `lesson.slides.feedback` joins this list
 * rather than changing what `lesson.slides` means.
 */
export const OAK_MATERIAL_KEYS = [
  "lesson.keyLearningPoints",
  "lesson.keywords",
  "lesson.misconceptions",
  "lesson.outcome",
  "lesson.slides",
  "lesson.transcript",
] as const;

export type OakMaterialKey = (typeof OAK_MATERIAL_KEYS)[number];

export type OakMaterialValue =
  | Readonly<{ keywords: readonly LessonKeyword[]; kind: "keywords" }>
  | Readonly<{ kind: "text"; text: string }>;

/** What a request carries, keyed by the part it satisfies. */
export type TransformationMaterial = Readonly<
  Partial<Record<OakMaterialKey, OakMaterialValue>>
>;

/** How a part reads to tooling that lists what a prompt can be given. */
export type OakMaterialSummary = Readonly<{
  available: boolean;
  key: OakMaterialKey;
  label: string;
  /** The heading it appears under inside `{{lessonMaterial}}`. */
  promptHeading: string;
  unavailableBecause?: string;
}>;

export type TransformationMaterialRequirement = Readonly<{
  key: OakMaterialKey;
  /** A required part that cannot be resolved stops the run. */
  required: boolean;
}>;

/**
 * One entry in the catalogue. A part owns everything specific to itself: what to
 * call it, how to read it from Oak, and how it reads in a prompt.
 */
export type OakMaterialPart = Readonly<{
  /** What a listing calls this part. */
  label: string;
  /**
   * Reads the part from a fetched lesson, or `null` while Oak publishes nothing
   * this part can be built from.
   */
  read: ((lesson: Lesson) => OakMaterialValue | undefined) | null;
  /** The part's body. Its heading comes from the label, so the two cannot drift. */
  render: (value: OakMaterialValue) => string;
  /** Why the part cannot be sent yet, for a listing to explain. */
  unavailableBecause?: string;
}>;
