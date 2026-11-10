import { firstRefusal, type RuleRefusal } from "../rules/rule";
import type { LessonRuleContext } from "./context";
import { LESSON_RULES } from "./rules";

export { applyLessonMaterialsRule } from "./lesson-materials";
export type { LessonRuleContext } from "./context";

export type LessonRefusal = RuleRefusal<"lesson", (typeof LESSON_RULES)[number]>;

export function lessonRefusal(context: LessonRuleContext): LessonRefusal | null {
  return firstRefusal("lesson", LESSON_RULES, context);
}
