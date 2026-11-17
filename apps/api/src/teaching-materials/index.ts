import type { LessonFactsContext, LessonIdentityContext } from "../rules/context";
import {
  ALL_TEACHING_MATERIALS,
  TEACHING_MATERIAL_SELECTIONS,
  TEACHING_MATERIALS_LESSON_RULES,
  type TeachingMaterialId,
} from "./rules";

export type { TeachingMaterialId } from "./rules";

type TeachingMaterialsContext = LessonIdentityContext & LessonFactsContext;

/** Independent of ORA's own rules: a lesson ORA refuses can still get these. */
export function teachingMaterialsFor(
  context: TeachingMaterialsContext,
): readonly TeachingMaterialId[] {
  if (TEACHING_MATERIALS_LESSON_RULES.some((rule) => rule.check(context) !== null)) {
    return [];
  }
  return selectTeachingMaterials(context);
}

export function selectTeachingMaterials(
  context: LessonFactsContext,
): readonly TeachingMaterialId[] {
  return (
    TEACHING_MATERIAL_SELECTIONS.find(({ rule }) => rule.check(context) !== null)
      ?.materials ?? ALL_TEACHING_MATERIALS
  );
}
