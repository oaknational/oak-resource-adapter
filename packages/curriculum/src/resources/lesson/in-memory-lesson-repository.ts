import type { Lesson, LessonRepository } from "./types.js";
import { CurriculumError } from "./errors.js";
import { validateLessonIdentity } from "./lesson-identity.js";

export function buildLesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    contentGuidance: [],
    identity: {
      lessonSlug: "adding-fractions",
      programmeSlug: "maths-primary-ks2",
    },
    isLegacy: false,
    programme: {
      examBoard: null,
      keyStage: "KS2",
      keyStageSlug: "ks2",
      subject: "Maths",
      subjectSlug: "maths",
      tier: null,
    },
    resources: [
      {
        type: "worksheet",
        url: "https://oak.example/worksheets/adding-fractions.pdf",
      },
    ],
    maxRestrictions: [],
    title: "Adding fractions",
    unit: { orderInUnit: 3, slug: "fractions", title: "Fractions" },
    ...overrides,
  };
}

export function createInMemoryLessonRepository(
  lessons: readonly Lesson[] = [],
): LessonRepository {
  const lessonsByIdentity = new Map(
    lessons.map((lesson) => [
      `${lesson.identity.lessonSlug}:${lesson.identity.programmeSlug}`,
      lesson,
    ]),
  );

  return {
    async fetch(lessonSlug, programmeSlug) {
      validateLessonIdentity(lessonSlug, programmeSlug);

      const lesson = lessonsByIdentity.get(`${lessonSlug}:${programmeSlug}`);
      if (!lesson) {
        throw new CurriculumError(
          `Oak publishes no lesson "${lessonSlug}" in programme "${programmeSlug}".`,
          { code: "not-found" },
        );
      }
      return lesson;
    },
  };
}
