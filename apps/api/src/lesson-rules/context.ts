import type { TeacherAccess } from "../teacher-access/access";
import type { LessonFactsContext, LessonIdentityContext } from "../rules/context";

/** `teacher` is `undefined` when signed out: signing in may unlock the lesson. */
export type TeacherContext = Readonly<{
  teacher: Pick<TeacherAccess, "inCopyrightRegion"> | undefined;
}>;

export type LessonRuleContext = LessonIdentityContext &
  LessonFactsContext &
  TeacherContext;
