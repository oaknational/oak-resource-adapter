import {
  contentGuidanceSchema,
  lessonAssetsSchema,
  lessonContentSchema,
  mvLessonRestrictionLevelsSchema,
  programmeFieldsSchema,
  restrictionLevel,
  syntheticUnitvariantLessonsByKsSchema,
  unitSchema,
} from "@oaknational/oak-curriculum-schema";
import { z } from "zod";

import type {
  LessonResource,
  LessonResourceType,
  ResourceFileLocation,
} from "../resource/resource.js";
import type {
  CategoryMaxRestriction,
  LessonKeyword,
  LessonMisconception,
  Programme,
  RestrictionLevel,
  ThirdPartyMaterialCategory,
  Unit,
} from "./lesson.js";

export const browseRowSchema = syntheticUnitvariantLessonsByKsSchema
  .pick({ unit_slug: true })
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
  .transform((row): { programme: Programme; unit: Unit } => ({
    programme: {
      examBoard: row.programme_fields.examboard,
      keyStage: row.programme_fields.keystage,
      keyStageSlug: row.programme_fields.keystage_slug,
      subject: row.programme_fields.subject,
      subjectSlug: row.programme_fields.subject_slug,
      tier: row.programme_fields.tier,
    },
    unit: {
      slug: row.unit_slug,
      title: row.unit_data.title,
    },
  }));

export const contentRowSchema = lessonContentSchema
  .pick({
    key_learning_points: true,
    lesson_keywords: true,
    misconceptions_and_common_mistakes: true,
    pupil_lesson_outcome: true,
    transcript_sentences: true,
  })
  .extend({
    content_guidance: z
      .array(contentGuidanceSchema.pick({ contentguidance_label: true }))
      .nullable(),
    lesson_title: z.string().min(1),
  })
  .transform(
    (
      row,
    ): {
      contentGuidance: readonly string[];
      keyLearningPoints: readonly string[];
      keywords: readonly LessonKeyword[];
      misconceptions: readonly LessonMisconception[];
      outcome: string | null;
      title: string;
      transcript: string | null;
    } => ({
      contentGuidance: (row.content_guidance ?? []).flatMap((guidance) =>
        guidance.contentguidance_label === null ? [] : [guidance.contentguidance_label],
      ),
      keyLearningPoints: (row.key_learning_points ?? []).map(
        ({ key_learning_point }) => key_learning_point,
      ),
      keywords: row.lesson_keywords ?? [],
      misconceptions: row.misconceptions_and_common_mistakes ?? [],
      outcome: row.pupil_lesson_outcome,
      title: row.lesson_title,
      transcript: row.transcript_sentences,
    }),
  );

/**
 * The content view also carries `worksheet_asset_object_url` and its siblings,
 * but those hold a Google Drive editing link rather than a file. The assets view
 * is where the published objects are, one column per kind.
 */
const ASSET_COLUMNS = [
  { type: "lesson-guide", column: "asset_lesson_guide" },
  { type: "slide-deck", column: "asset_slidedeck" },
  { type: "supplementary", column: "asset_supplementary_asset" },
  { type: "worksheet", column: "asset_worksheet" },
  { type: "worksheet-answers", column: "asset_worksheet_answers" },
] as const satisfies readonly { type: LessonResourceType; column: string }[];

/**
 * Quizzes sit in their own columns, hold their questions and answers together,
 * and have no Google document. A quiz with no PDF is one Oak publishes as data
 * only, which is an absence rather than a fault.
 */
const QUIZ_COLUMNS = [
  {
    column: "quiz_exit",
    questionsType: "exit-quiz",
    answersType: "exit-quiz-answers",
  },
  {
    column: "quiz_starter",
    questionsType: "starter-quiz",
    answersType: "starter-quiz-answers",
  },
] as const satisfies readonly {
  column: string;
  questionsType: LessonResourceType;
  answersType: LessonResourceType;
}[];

export const ASSET_CONTENT_COLUMNS: readonly string[] = [
  ...ASSET_COLUMNS.map(({ column }) => column),
  ...QUIZ_COLUMNS.map(({ column }) => column),
];

const assetsColumnsSchema = lessonAssetsSchema.pick({
  asset_lesson_guide: true,
  asset_slidedeck: true,
  asset_supplementary_asset: true,
  asset_worksheet: true,
  asset_worksheet_answers: true,
  quiz_exit: true,
  quiz_starter: true,
});

type AssetsRow = z.output<typeof assetsColumnsSchema>;

export const assetsRowSchema = assetsColumnsSchema.transform(
  (row, ctx): { resources: readonly LessonResource[] } => ({
    resources: [...assetResources(row, ctx), ...quizResources(row)],
  }),
);

function assetResources(row: AssetsRow, ctx: z.RefinementCtx): LessonResource[] {
  return ASSET_COLUMNS.flatMap(({ type, column }) => {
    const asset = row[column];
    if (asset === null || asset === undefined) {
      return [];
    }

    const pdf = fileLocation(asset.asset_object?.pdf);
    const googleDriveUrl =
      asset.asset_object?.google_drive?.url ??
      asset.asset_object?.google_slide?.url ??
      null;

    if (pdf === null && googleDriveUrl === null) {
      ctx.addIssue({
        code: "custom",
        message: `publishes a ${type} with nowhere to read it from`,
        path: [column],
      });
      return [];
    }

    return [{ type, pdf, googleDriveUrl }];
  });
}

function quizResources(row: AssetsRow): LessonResource[] {
  return QUIZ_COLUMNS.flatMap(({ column, questionsType, answersType }) => {
    const quiz = row[column];
    if (quiz === null || quiz === undefined) {
      return [];
    }

    return [
      { type: questionsType, pdf: fileLocation(quiz.quiz_object?.quiz?.pdf) },
      { type: answersType, pdf: fileLocation(quiz.quiz_object?.quiz_answers?.pdf) },
    ].flatMap(({ type, pdf }) =>
      pdf === null ? [] : [{ type, pdf, googleDriveUrl: null }],
    );
  });
}

function fileLocation(
  bucket:
    | {
        bucket_name?: string | null | undefined;
        bucket_path?: string | null | undefined;
      }
    | null
    | undefined,
): ResourceFileLocation | null {
  const bucketName = bucket?.bucket_name;
  const bucketPath = bucket?.bucket_path;

  return bucketName == null || bucketPath == null ? null : { bucketName, bucketPath };
}

type PublishedRestrictionLevel = z.infer<typeof restrictionLevel>;

const RESTRICTION_LEVELS = {
  "Highly restricted": "highly-restricted",
  "OGL compatible": "ogl-compatible",
  "OGL equivalent": "ogl-equivalent",
  Restricted: "restricted",
} as const satisfies Record<PublishedRestrictionLevel, RestrictionLevel>;

const CATEGORY_BY_MAX_RESTRICTION_COLUMN = {
  tpc_downloadablefiles_max_restriction: "downloadable-files",
  tpc_media_max_restriction: "media",
  tpc_quizimages_max_restriction: "quiz-images",
  tpc_works_max_restriction: "works",
} as const satisfies Record<string, ThirdPartyMaterialCategory>;

type MaxRestrictionColumn = keyof typeof CATEGORY_BY_MAX_RESTRICTION_COLUMN;

export const RESTRICTION_COLUMNS: readonly string[] = Object.keys(
  CATEGORY_BY_MAX_RESTRICTION_COLUMN,
);

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
