import type { LessonEligibilityFacts } from "@oaknational/resource-adapter-curriculum";

import type { TeacherAccess } from "../teacher-access/access";
import { copyrightRefusalReason, type CopyrightRefusalReason } from "./copyright";
import { geoRefusalReason, type GeoRefusalReason } from "./geo";
import {
  lessonStatusRefusalReason,
  type LessonStatusRefusalReason,
} from "./lesson-status";
import { subjectRefusalReason, type SubjectRefusalReason } from "./subject";

export { applyLessonMaterialsRule } from "./lesson-materials";

export type LessonRefusal = Readonly<
  | { rule: "lesson-status"; reason: LessonStatusRefusalReason }
  | { rule: "subject"; reason: SubjectRefusalReason }
  | { rule: "copyright"; reason: CopyrightRefusalReason }
  | { rule: "geo"; reason: GeoRefusalReason }
>;

export function lessonRefusal(
  facts: LessonEligibilityFacts | null,
  teacher: Pick<TeacherAccess, "inCopyrightRegion"> | undefined,
): LessonRefusal | null {
  if (facts === null) {
    return { rule: "lesson-status", reason: "unpublished" };
  }
  const subject = subjectRefusalReason(facts);
  if (subject !== null) {
    return { rule: "subject", reason: subject };
  }
  const copyright = copyrightRefusalReason(facts);
  if (copyright !== null) {
    return { rule: "copyright", reason: copyright };
  }
  const geo = geoRefusalReason(facts, teacher);
  if (geo !== null) {
    return { rule: "geo", reason: geo };
  }
  const status = lessonStatusRefusalReason(facts);
  return status === null ? null : { rule: "lesson-status", reason: status };
}
