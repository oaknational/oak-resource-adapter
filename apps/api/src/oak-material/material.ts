import type { Lesson, LessonKeyword } from "@oaknational/resource-adapter-curriculum";

import type { TranscriptSummary } from "./transcript-summary/schema";

export const OAK_MATERIAL_KEYS = [
  "lesson.keyLearningPoints",
  "lesson.keywords",
  "lesson.misconceptions",
  "lesson.outcome",
  "lesson.slides",
  "lesson.transcript",
  "lesson.transcriptSummary",
  "lesson.transcriptSummary.checksForUnderstanding",
  "lesson.transcriptSummary.learningCycleTitles",
  "lesson.transcriptSummary.practiceTasksWithFeedback",
] as const;

export type OakMaterialKey = (typeof OAK_MATERIAL_KEYS)[number];

export type OakMaterialValue =
  | Readonly<{ keywords: readonly LessonKeyword[]; kind: "keywords" }>
  | Readonly<{ kind: "text"; text: string }>
  | Readonly<{ kind: "transcriptSummary"; summary: TranscriptSummary }>;

export type OakMaterialDerivation =
  | Readonly<{ value: OakMaterialValue; failedBecause?: never }>
  | Readonly<{ value?: never; failedBecause: string }>;

export type SummariseTranscript = (
  transcript: string,
) => Promise<TranscriptSummary | undefined>;

export type OakMaterialDerivationDependencies = Readonly<{
  summariseTranscript?: SummariseTranscript;
}>;

export type OakMaterial = Readonly<Partial<Record<OakMaterialKey, OakMaterialValue>>>;

export type OakMaterialSummary = Readonly<{
  available: boolean;
  key: OakMaterialKey;
  label: string;
  promptHeading: string;
  unavailableBecause?: string;
}>;

export type OakMaterialRequirement = Readonly<{
  key: OakMaterialKey;
  required: boolean;
}>;

/** Why each requested part is missing, addressed by the part it concerns. */
export type OakMaterialOmissions = Readonly<Partial<Record<OakMaterialKey, string>>>;

export type OakMaterialPart = Readonly<{
  label: string;
  read: ((lesson: Lesson) => OakMaterialValue | undefined) | null;
  derive?: (
    lesson: Lesson,
    derivationDependencies: OakMaterialDerivationDependencies,
  ) => Promise<OakMaterialDerivation | undefined>;
  render: (value: OakMaterialValue) => string;
  unavailableBecause?: string;
}>;
