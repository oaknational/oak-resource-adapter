import {
  createOakLessonRepository,
  createOakLessonEligibilityFactsReader,
  findLessonResource,
  oakCurriculumConfigFromEnv,
} from "@oaknational/resource-adapter-curriculum";
import {
  originalResourceDocumentFixtureManifest,
  type OakWorksheetFixtureEntry,
} from "@oaknational/resource-adapter-original-resource-documents/fixtures";
import { describe, expect, it } from "vitest";

import { lessonRefusal } from ".";

/** Reaches Oak's curriculum endpoint. Run with `pnpm fixtures:rights:check` from the root. */
const describeCheck =
  process.env.RUN_FIXTURE_RIGHTS_CHECK === "1" ? describe : describe.skip;

const oakFixtures = originalResourceDocumentFixtureManifest
  .filter((entry): entry is OakWorksheetFixtureEntry => "oakLesson" in entry)
  .map(({ id, oakLesson }) => [id, oakLesson] as const);

describeCheck("Oak worksheet fixtures", () => {
  it.each(oakFixtures)(
    "%s publishes a worksheet and passes ORA's lesson rules",
    async (_, { lessonSlug, programmeSlug }) => {
      const config = oakCurriculumConfigFromEnv(process.env);
      const identity = { lessonSlug, programmeSlug };

      const lesson = await createOakLessonRepository(config).fetch(identity);
      const facts = await createOakLessonEligibilityFactsReader(config)(identity);

      expect(findLessonResource(lesson, "worksheet")).toBeDefined();
      // Outside every copyright region, so the fixture suits any teacher.
      expect(lessonRefusal(facts, { inCopyrightRegion: false })).toBeNull();
    },
  );
});
