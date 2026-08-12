/**
 * Zod validation schemas for lesson responses from Hasura.
 * Schemas are derived from oak-curriculum-schema and transform raw Hasura data
 * into domain types. Boundary protection: fails immediately if upstream shape diverges.
 */

import {
  assetTypeSchema,
  contentGuidanceSchema,
  lessonContentSchema,
  mvLessonRestrictionLevelsSchema,
  programmeFieldsSchema,
  restrictionLevel,
  syntheticUnitvariantLessonsByKsSchema,
  unitSchema,
} from "@oaknational/oak-curriculum-schema";
import { z } from "zod";

export type LessonResourceType = z.infer<typeof assetTypeSchema>;

export type LessonResource = Readonly<{
  type: LessonResourceType;
  url: string;
}>;

export const browseRowSchema = syntheticUnitvariantLessonsByKsSchema
  .pick({
    is_legacy: true,
    order_in_unit: true,
    unit_slug: true,
  })
  .extend({
    programme_fields: programmeFieldsSchema.pick({
      examboard: true,
      keystage: true,
      keystage_slug: true,
      subject: true,
      subject_slug: true,
      tier: true,
    }),
    unit_data: unitSchema.pick({ title: true }),
  })
  .transform((row) => ({
    isLegacy: row.is_legacy,
    programme: {
      examBoard: row.programme_fields.examboard,
      keyStage: row.programme_fields.keystage,
      keyStageSlug: row.programme_fields.keystage_slug,
      subject: row.programme_fields.subject,
      subjectSlug: row.programme_fields.subject_slug,
      tier: row.programme_fields.tier,
    },
    unit: {
      orderInUnit: row.order_in_unit,
      slug: row.unit_slug,
      title: row.unit_data.title,
    },
  }));

export const contentRowSchema = lessonContentSchema
  .pick({ has_worksheet_asset_object: true })
  .extend({
    content_guidance: z
      .array(contentGuidanceSchema.pick({ contentguidance_label: true }))
      .nullable(),
    lesson_title: z.string(),
    worksheet_asset_object_url: z.string().nullable(),
  })
  .transform((row, ctx) => {
    const resources: LessonResource[] = [];
    if (row.has_worksheet_asset_object === true) {
      if (row.worksheet_asset_object_url === null) {
        ctx.addIssue({
          code: "custom",
          message: "publishes a worksheet but no URL for it",
          path: ["worksheet_asset_object_url"],
        });
        return z.NEVER;
      }
      resources.push({ type: "worksheet", url: row.worksheet_asset_object_url });
    }

    return {
      contentGuidance: (row.content_guidance ?? []).flatMap((guidance) =>
        guidance.contentguidance_label === null ? [] : [guidance.contentguidance_label],
      ),
      resources,
      title: row.lesson_title,
    };
  });

type PublishedRestrictionLevel = z.infer<typeof restrictionLevel>;

const RESTRICTION_LEVELS = {
  "Highly restricted": "highly-restricted",
  "OGL compatible": "ogl-compatible",
  "OGL equivalent": "ogl-equivalent",
  Restricted: "restricted",
} as const satisfies Record<PublishedRestrictionLevel, string>;

export type RestrictionLevel =
  (typeof RESTRICTION_LEVELS)[keyof typeof RESTRICTION_LEVELS];

const CATEGORY_BY_MAX_RESTRICTION_COLUMN = {
  tpc_downloadablefiles_max_restriction: "downloadable-files",
  tpc_media_max_restriction: "media",
  tpc_quizimages_max_restriction: "quiz-images",
  tpc_works_max_restriction: "works",
} as const;

type MaxRestrictionColumn = keyof typeof CATEGORY_BY_MAX_RESTRICTION_COLUMN;

export type ThirdPartyMaterialCategory =
  (typeof CATEGORY_BY_MAX_RESTRICTION_COLUMN)[keyof typeof CATEGORY_BY_MAX_RESTRICTION_COLUMN];

export type CategoryMaxRestriction = Readonly<{
  category: ThirdPartyMaterialCategory;
  /** The most restrictive level across the lesson's material in this category. */
  maxLevel: RestrictionLevel;
}>;

export const restrictionRowSchema = mvLessonRestrictionLevelsSchema
  .pick({
    tpc_downloadablefiles_max_restriction: true,
    tpc_media_max_restriction: true,
    tpc_quizimages_max_restriction: true,
    tpc_works_max_restriction: true,
  })
  // A null column is a category the lesson carries no material of, not a restriction.
  .transform((row): readonly CategoryMaxRestriction[] =>
    Object.entries(CATEGORY_BY_MAX_RESTRICTION_COLUMN).flatMap(([column, category]) => {
      const level = row[column as MaxRestrictionColumn];
      return level === null ? [] : [{ category, maxLevel: RESTRICTION_LEVELS[level] }];
    }),
  );
