import {
  createOakLessonRepository,
  findLessonResource,
  oakCurriculumConfigFromEnv,
} from "../packages/curriculum/dist/index.js";
import { originalResourceDocumentFixtureManifest } from "../packages/original-resource-documents/dist/fixtures.js";

const repository = createOakLessonRepository(oakCurriculumConfigFromEnv(process.env));
const oakFixtures = originalResourceDocumentFixtureManifest.filter(
  (entry) => "oakLesson" in entry,
);
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

  if (lesson.maxRestrictions.length > 0) {
    failures.push(
      `${fixture.id}: Oak records restrictions ${JSON.stringify(lesson.maxRestrictions)}.`,
    );
  }
}

if (failures.length > 0) {
  throw new Error(`Fixture rights verification failed:\n${failures.join("\n")}`);
}

console.log(
  `Verified ${oakFixtures.length} Oak worksheet fixtures with empty maxRestrictions.`,
);
