import { lessonKeyLearningPointsPart } from "./lesson-key-learning-points";
import { lessonKeywordsPart } from "./lesson-keywords";
import { lessonMisconceptionsPart } from "./lesson-misconceptions";
import { lessonOutcomePart } from "./lesson-outcome";
import { lessonSlidesPart } from "./lesson-slides";
import { lessonTranscriptPart } from "./lesson-transcript";
import {
  OAK_MATERIAL_KEYS,
  type OakMaterialKey,
  type OakMaterialPart,
  type OakMaterialSummary,
} from "./material";

export const OAK_MATERIAL: Readonly<Record<OakMaterialKey, OakMaterialPart>> = {
  "lesson.keyLearningPoints": lessonKeyLearningPointsPart,
  "lesson.keywords": lessonKeywordsPart,
  "lesson.misconceptions": lessonMisconceptionsPart,
  "lesson.outcome": lessonOutcomePart,
  "lesson.slides": lessonSlidesPart,
  "lesson.transcript": lessonTranscriptPart,
};

export function oakMaterialIsAvailable(key: OakMaterialKey): boolean {
  return OAK_MATERIAL[key].read !== null;
}

/** The heading this part appears under inside `{{lessonMaterial}}`. */
export function oakMaterialPromptHeading(key: OakMaterialKey): string {
  return OAK_MATERIAL[key].label.toUpperCase();
}

/** A serialisable catalogue, for tooling that explains what a prompt can be given. */
export function listOakMaterial(): readonly OakMaterialSummary[] {
  return OAK_MATERIAL_KEYS.map((key) => {
    const part = OAK_MATERIAL[key];

    return {
      available: oakMaterialIsAvailable(key),
      key,
      label: part.label,
      promptHeading: oakMaterialPromptHeading(key),
      ...(part.unavailableBecause === undefined
        ? {}
        : { unavailableBecause: part.unavailableBecause }),
    };
  });
}
