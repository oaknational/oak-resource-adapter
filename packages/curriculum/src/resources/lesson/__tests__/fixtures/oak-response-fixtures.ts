import {
  type LessonContent,
  lessonContentFixture,
  type MvLessonRestrictionLevels,
  mvLessonRestrictionLevelsFixture,
  programmeFieldsFixture,
  type SyntheticUnitvariantLessonsByKs,
  syntheticUnitvariantLessonsByKsFixture,
  unitFixture,
} from "@oaknational/oak-curriculum-schema";

export function browseDataRow(
  overrides: Partial<SyntheticUnitvariantLessonsByKs> = {},
): SyntheticUnitvariantLessonsByKs {
  return syntheticUnitvariantLessonsByKsFixture({
    overrides: {
      is_legacy: false,
      lesson_slug: "adding-fractions",
      order_in_unit: 3,
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
      has_worksheet_asset_object: true,
      lesson_slug: "adding-fractions",
      lesson_title: "Adding fractions",
      worksheet_asset_object_url: "https://oak.example/worksheets/adding-fractions.pdf",
      ...overrides,
    },
  });
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
