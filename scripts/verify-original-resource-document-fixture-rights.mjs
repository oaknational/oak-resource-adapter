import { pathToFileURL } from "node:url";
import {
  createOakLessonRepository,
  createOakLessonRightsReader,
  findLessonResource,
  hasAdaptableRights,
  oakCurriculumConfigFromEnv,
} from "../packages/curriculum/dist/index.js";
import { originalResourceDocumentFixtureManifest } from "../packages/original-resource-documents/dist/fixtures.js";

export async function verifyFixtureRights(fixtures, repository, readRights) {
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
    const rights = await readRights(identity);
    if (rights === null || !hasAdaptableRights(rights)) {
      failures.push(
        `${fixture.id}: Oak records disallowed rights ${JSON.stringify(rights)}.`,
      );
    }
  }
  if (failures.length > 0) {
    throw new Error(`Fixture rights verification failed:\n${failures.join("\n")}`);
  }
  return oakFixtures.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = oakCurriculumConfigFromEnv(process.env);
  const count = await verifyFixtureRights(
    originalResourceDocumentFixtureManifest,
    createOakLessonRepository(config),
    createOakLessonRightsReader(config),
  );
  console.log(`Verified ${count} Oak worksheet fixtures with adaptable rights.`);
}
