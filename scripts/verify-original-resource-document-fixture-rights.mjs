import { pathToFileURL } from "node:url";
import {
  createOakLessonRepository,
  findLessonResource,
  hasAdaptableRights,
  oakCurriculumConfigFromEnv,
} from "../packages/curriculum/dist/index.js";
import { originalResourceDocumentFixtureManifest } from "../packages/original-resource-documents/dist/fixtures.js";

export async function verifyFixtureRights(fixtures, repository) {
  const oakFixtures = fixtures.filter((entry) => "oakLesson" in entry);
  const failures = [];
  for (const fixture of oakFixtures) {
    const identity = {
      lessonSlug: fixture.oakLesson.lessonSlug,
      programmeSlug: fixture.oakLesson.programmeSlug,
    };
    const lesson = await repository.fetch(identity);
    if (findLessonResource(lesson, "worksheet") === undefined) {
      failures.push(`${fixture.id}: Oak publishes no worksheet.`);
    }
    if (!hasAdaptableRights(lesson.maxRestrictions)) {
      failures.push(
        `${fixture.id}: Oak records disallowed restrictions ${JSON.stringify(lesson.maxRestrictions)}.`,
      );
    }
  }
  if (failures.length > 0) {
    throw new Error(`Fixture rights verification failed:\n${failures.join("\n")}`);
  }
  return oakFixtures.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repository = createOakLessonRepository(oakCurriculumConfigFromEnv(process.env));
  const count = await verifyFixtureRights(
    originalResourceDocumentFixtureManifest,
    repository,
  );
  console.log(`Verified ${count} Oak worksheet fixtures with adaptable rights.`);
}
