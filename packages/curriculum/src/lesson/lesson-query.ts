import { ASSET_CONTENT_COLUMNS, RESTRICTION_COLUMNS } from "./lesson-schema.js";

/**
 * Oak versions its published views in their names, so a schema change arrives
 * as a new view rather than as a changed one. Moving to a newer view is a
 * deliberate edit here, checked by the integration test.
 */
const LESSON_VIEWS = {
  assets: "published_mv_lesson_assets_1",
  browseData: "published_mv_synthetic_unitvariant_lessons_by_keystage_18_0_0",
  content: "published_mv_lesson_content_published_9_0_0",
  restrictionLevels: "published_mv_lesson_restriction_levels_1",
} as const;

/**
 * Shared by both queries below. Despite its name the view carries a row per
 * `_state`, and an unpublished row can record different levels from the
 * published one, so `atMostOne` cannot resolve the lesson without this filter.
 */
const RESTRICTION_LEVELS_SELECTION = `restrictionLevels: ${LESSON_VIEWS.restrictionLevels}(
      where: { slug: { _eq: $lessonSlug }, _state: { _eq: "published" } }
    ) {
      ${RESTRICTION_COLUMNS.join("\n      ")}
    }`;

/**
 * The whole lesson: only the columns the schemas read. Every view except browse
 * data is keyed by lesson alone; only browse data distinguishes programmes. The
 * content view needs the same published filter as restrictions; assets has no
 * such column.
 */
export const LESSON_BY_SLUG_QUERY = `
  query LessonBySlug($lessonSlug: String!, $programmeSlug: String!) {
    browseData: ${LESSON_VIEWS.browseData}(
      where: {
        lesson_slug: { _eq: $lessonSlug }
        programme_slug: { _eq: $programmeSlug }
      }
    ) {
      programme_fields
      unit_data
      unit_slug
    }
    content: ${LESSON_VIEWS.content}(
      where: { lesson_slug: { _eq: $lessonSlug }, _state: { _eq: "published" } }
    ) {
      content_guidance
      key_learning_points
      lesson_keywords
      lesson_title
      misconceptions_and_common_mistakes
      pupil_lesson_outcome
      transcript_sentences
    }
    assets: ${LESSON_VIEWS.assets}(
      where: { slug: { _eq: $lessonSlug } }
    ) {
      ${ASSET_CONTENT_COLUMNS.join("\n      ")}
    }
    ${RESTRICTION_LEVELS_SELECTION}
  }
`;

/**
 * Restrictions alone, for the availability call OWA makes on every lesson page.
 * `LESSON_BY_SLUG_QUERY` still selects them: `Lesson.maxRestrictions` is part
 * of the aggregate, and the fixture rights check reads them from there.
 */
export const LESSON_RESTRICTIONS_QUERY = `
  query LessonRestrictions($lessonSlug: String!) {
    ${RESTRICTION_LEVELS_SELECTION}
  }
`;
