/**
 * Lesson domain types derived from Zod schemas.
 * Types are calculated from schemas, not restated separately.
 */

import type { z } from "zod";
import type {
  browseRowSchema,
  CategoryMaxRestriction,
  contentRowSchema,
  LessonResource,
  LessonResourceType,
  restrictionRowSchema,
} from "./lesson-schema.js";

export type LessonIdentity = Readonly<{
  lessonSlug: string;
  programmeSlug: string;
}>;

export type LessonPlacement = z.output<typeof browseRowSchema>;
export type LessonContent = z.output<typeof contentRowSchema>;
export type LessonRestrictions = z.output<typeof restrictionRowSchema>;

export type Programme = LessonPlacement["programme"];
export type Unit = LessonPlacement["unit"];

export type Lesson = Readonly<{
  identity: LessonIdentity;
  maxRestrictions: LessonRestrictions;
}> &
  LessonPlacement &
  LessonContent;

export interface LessonRepository {
  fetch(lessonSlug: string, programmeSlug: string): Promise<Lesson>;
}

export type { CategoryMaxRestriction, LessonResource, LessonResourceType };
