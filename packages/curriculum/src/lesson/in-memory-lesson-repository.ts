import { lessonNotFound, validateLessonIdentity } from "./lesson-identity.js";
import type { Lesson, LessonIdentity, LessonRepository } from "./lesson.js";

export function buildLesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    contentGuidance: [],
    identity: {
      lessonSlug: "adding-fractions",
      programmeSlug: "maths-primary-ks2",
    },
    maxRestrictions: [],
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
        pdf: {
          bucketName: "ingested-assets-example",
          bucketPath: "LESS-EXAMP-1/worksheet/PDF.pdf",
        },
        googleDriveUrl: "https://docs.google.com/presentation/d/example/edit",
      },
    ],
    title: "Adding fractions",
    unit: { slug: "fractions", title: "Fractions" },
    ...overrides,
  };
}

export function createInMemoryLessonRepository(
  lessons: readonly Lesson[] = [],
): LessonRepository {
  const lessonsByIdentity = new Map(
    lessons.map((lesson) => [identityKey(lesson.identity), lesson]),
  );

  return {
    async fetch(identity: LessonIdentity): Promise<Lesson> {
      validateLessonIdentity(identity);

      const lesson = lessonsByIdentity.get(identityKey(identity));
      if (lesson === undefined) {
        throw lessonNotFound(identity);
      }

      return lesson;
    },
  };
}

function identityKey(identity: LessonIdentity): string {
  return `${identity.lessonSlug}:${identity.programmeSlug}`;
}
