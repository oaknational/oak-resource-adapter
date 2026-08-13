import { beforeAll, describe, expect, it } from "vitest";

import { oakCurriculumConfigFromEnv, oakResourceStoreConfigFromEnv } from "./config.js";
import { CurriculumError } from "./errors.js";
import type { LessonRepository } from "./lesson/lesson.js";
import { findLessonResource } from "./resource/resource.js";
import { createOakLessonRepository } from "./lesson/oak-lesson-repository.js";
import { createOakResourceStore } from "./resource/oak-resource-store.js";
import type { ResourceStore } from "./resource/resource.js";

/**
 * Reaches Oak's curriculum endpoint and downloads API. Run with
 * `pnpm test:integration --filter=@oaknational/resource-adapter-curriculum`:
 * only the root script loads the `.env` these need.
 */
const describeIntegration =
  process.env.RUN_CURRICULUM_INTEGRATION_TESTS === "1" ? describe : describe.skip;

const LESSON_WITH_WORKSHEET = {
  lessonSlug: "adding-additional-features-to-your-buggy",
  programmeSlug: "computing-secondary-ks4-core",
};

const LESSON_WITH_CONTENT_GUIDANCE = {
  lessonSlug: "nazi-control-of-the-police-and-the-legal-system",
  programmeSlug: "history-secondary-ks4-edexcel",
};

const LESSON_WITHOUT_WORKSHEET = {
  lessonSlug: "maintain-possession-with-keep-ball",
  programmeSlug: "physical-education-secondary-ks3",
};

/** A lesson Oak restricts the third-party material of. */
const RESTRICTED_LESSON = {
  lessonSlug: "musical-fusion-in-the-americas-and-africa",
  programmeSlug: "music-secondary-ks4-edexcel",
};

describeIntegration("Oak curriculum endpoint (development)", () => {
  let lessons: LessonRepository;
  let resources: ResourceStore;

  beforeAll(() => {
    lessons = createOakLessonRepository(oakCurriculumConfigFromEnv(process.env));
    resources = createOakResourceStore(oakResourceStoreConfigFromEnv(process.env));
  });

  it("fetches a known lesson", async () => {
    const lesson = await lessons.fetch(LESSON_WITH_WORKSHEET);

    expect(lesson).toMatchObject({
      identity: LESSON_WITH_WORKSHEET,
      programme: { keyStageSlug: "ks4", subject: expect.any(String) },
      title: expect.any(String),
      unit: { title: expect.any(String) },
    });
  });

  it("fails when the lesson does not exist", async () => {
    const error = await lessons
      .fetch({ ...LESSON_WITH_WORKSHEET, lessonSlug: "no-such-lesson-anywhere" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CurriculumError);
    expect((error as CurriculumError).code).toBe("not-found");
  });

  it("locates the worksheet Oak publishes for the lesson", async () => {
    const lesson = await lessons.fetch(LESSON_WITH_WORKSHEET);
    const worksheet = findLessonResource(lesson, "worksheet");

    expect(worksheet).toMatchObject({
      type: "worksheet",
      pdf: {
        bucketName: expect.any(String),
        bucketPath: expect.stringContaining("worksheet"),
      },
      googleDriveUrl: expect.stringContaining("docs.google.com"),
    });
  });

  it("reads the bytes of a worksheet through the downloads API", async () => {
    const lesson = await lessons.fetch(LESSON_WITH_WORKSHEET);

    const file = await resources.fetch(lesson, "worksheet");

    expect(file.contentType).toBe("application/pdf");
    expect(file.bytes.byteLength).toBeGreaterThan(1_000);
    // A PDF starts with %PDF-, so this proves a file rather than an error page.
    expect(new TextDecoder().decode(file.bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("reports a resource the lesson does not publish", async () => {
    const lesson = await lessons.fetch(LESSON_WITHOUT_WORKSHEET);

    await expect(resources.fetch(lesson, "worksheet")).rejects.toMatchObject({
      code: "unavailable-resource",
    });
  });

  it("returns no worksheet when the lesson has none", async () => {
    const lesson = await lessons.fetch(LESSON_WITHOUT_WORKSHEET);

    expect(findLessonResource(lesson, "worksheet")).toBeUndefined();
  });

  it("locates the quizzes Oak publishes for a lesson", async () => {
    const lesson = await lessons.fetch(LESSON_WITHOUT_WORKSHEET);

    for (const type of [
      "starter-quiz",
      "starter-quiz-answers",
      "exit-quiz",
      "exit-quiz-answers",
    ] as const) {
      expect(findLessonResource(lesson, type)?.pdf).toMatchObject({
        bucketName: expect.any(String),
        bucketPath: expect.any(String),
      });
    }
  });

  it("returns no content guidance when the lesson has none", async () => {
    const lesson = await lessons.fetch(LESSON_WITH_WORKSHEET);

    expect(lesson.contentGuidance).toEqual([]);
  });

  it("returns the content guidance for a lesson that has it", async () => {
    const lesson = await lessons.fetch(LESSON_WITH_CONTENT_GUIDANCE);

    expect(lesson.contentGuidance).toEqual(
      expect.arrayContaining([
        "Depiction or discussion of discriminatory behaviour",
        "Depiction or discussion of sensitive content",
        "Depiction or discussion of violence or suffering",
      ]),
    );
  });

  it("reports the restriction levels of a lesson that carries third-party material", async () => {
    const lesson = await lessons.fetch(RESTRICTED_LESSON);

    expect(lesson.maxRestrictions).toContainEqual({
      category: "media",
      maxLevel: "restricted",
    });
  });
});
