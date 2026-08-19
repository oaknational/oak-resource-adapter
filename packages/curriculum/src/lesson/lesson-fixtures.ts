import {
  lessonContentFixture,
  mvLessonRestrictionLevelsFixture,
  programmeFieldsFixture,
  syntheticUnitvariantLessonsByKsFixture,
  unitFixture,
  type LessonAssets,
  type LessonContent,
  type MvLessonRestrictionLevels,
  type SyntheticUnitvariantLessonsByKs,
} from "@oaknational/oak-curriculum-schema";

export function browseDataRow(
  overrides: Partial<SyntheticUnitvariantLessonsByKs> = {},
): SyntheticUnitvariantLessonsByKs {
  return syntheticUnitvariantLessonsByKsFixture({
    overrides: {
      lesson_slug: "adding-fractions",
      programme_fields: programmeFieldsFixture({
        overrides: {
          keystage: "KS2",
          keystage_description: "Key Stage 2",
          keystage_slug: "ks2",
          subject: "Maths",
          subject_slug: "maths",
        },
      }),
      programme_slug: "maths-primary-ks2",
      unit_data: unitFixture({
        overrides: { slug: "fractions", title: "Fractions" },
      }),
      unit_slug: "fractions",
      ...overrides,
    },
  });
}

export function contentRow(overrides: Partial<LessonContent> = {}): LessonContent {
  return lessonContentFixture({
    overrides: {
      content_guidance: null,
      key_learning_points: [],
      lesson_keywords: [],
      lesson_slug: "adding-fractions",
      lesson_title: "Adding fractions",
      misconceptions_and_common_mistakes: [],
      pupil_lesson_outcome: null,
      transcript_sentences: null,
      ...overrides,
    },
  });
}

/** The package publishes no fixture for the assets view. */
export function assetRow(
  overrides: Partial<NonNullable<LessonAssets["asset_worksheet"]>> = {},
): NonNullable<LessonAssets["asset_worksheet"]> {
  return {
    asset_uid: "RESO-EXAMP-1",
    asset_type: "worksheet",
    created_at: "2025-06-27T13:23:27.07045+00:00",
    updated_at: "2025-08-05T17:30:47.365049+00:00",
    asset_object: {
      pdf: {
        bucket_name: "ingested-assets-example",
        bucket_path: "LESS-EXAMP-1/worksheet/PDF.pdf",
      },
      google_drive: {
        id: "example",
        url: "https://docs.google.com/presentation/d/example/edit",
      },
    },
    ...overrides,
  };
}

export function quizRow(prefix: string): NonNullable<LessonAssets["quiz_starter"]> {
  return {
    quiz_uid: `QUIZ-EXAMP-${prefix}`,
    updated_at: "2025-09-09T16:13:35.367497+00:00",
    quiz_object: {
      quiz: {
        pdf: {
          bucket_name: "oak-quizzes-example",
          bucket_path: `LESS-EXAMP-1/${prefix}/questions.pdf`,
        },
      },
      quiz_answers: {
        pdf: {
          bucket_name: "oak-quizzes-example",
          bucket_path: `LESS-EXAMP-1/${prefix}/answers.pdf`,
        },
      },
    },
  };
}

export function assetsRow(
  overrides: Partial<LessonAssets> = {},
): Partial<LessonAssets> {
  return {
    asset_lesson_guide: null,
    asset_slidedeck: null,
    asset_supplementary_asset: null,
    asset_worksheet: assetRow(),
    asset_worksheet_answers: null,
    quiz_exit: null,
    quiz_starter: null,
    ...overrides,
  };
}

export function restrictionLevelsRow(
  overrides: Partial<MvLessonRestrictionLevels> = {},
): MvLessonRestrictionLevels {
  return mvLessonRestrictionLevelsFixture({
    overrides: {
      slug: "adding-fractions",
      tpc_downloadablefiles_max_restriction: null,
      tpc_media_max_restriction: null,
      tpc_quizimages_max_restriction: null,
      tpc_works_max_restriction: null,
      ...overrides,
    },
  });
}
