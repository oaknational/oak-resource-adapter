import { beforeAll, describe, expect, it } from "vitest";

import { CurriculumError } from "../../errors.js";
import { createOakLessonRepository } from "../../lesson-repository.js";
import type { LessonRepository } from "../../types.js";
import { oakCurriculumConfigFromEnv } from "../../../../config/oak-curriculum-config.js";

// Set the environment variable to run these tests, which are integration tests against the Oak curriculum endpoint.
const enabled = process.env.RUN_CURRICULUM_INTEGRATION_TESTS === "true";

/**
 * A know lesson
 */
const LESSON = {
  lessonSlug: "adding-additional-features-to-your-buggy",
  programmeSlug: "computing-secondary-ks4-core",
};

/**
 * A lesson with content guidance
 */
const CONTENT_GUIDANCE_LESSON = {
  lessonSlug: "nazi-control-of-the-police-and-the-legal-system",
  programmeSlug: "history-secondary-ks4-edexcel",
};

/**
 * A lesson PE OAK lesson with no worksheet
 */
const WORKSHEETLESS_LESSON = {
  lessonSlug: "maintain-possession-with-keep-ball",
  programmeSlug: "physical-education-secondary-ks3",
};

/** A lesson Oak that restricts third-party material. */
const RESTRICTED_LESSON = {
  lessonSlug: "musical-fusion-in-the-americas-and-africa",
  programmeSlug: "music-secondary-ks4-edexcel",
};

describe.runIf(enabled)("Oak curriculum endpoint (development)", () => {
  let repository: LessonRepository;

  beforeAll(() => {
    if (!enabled) {
      return;
    }

    repository = createOakLessonRepository(oakCurriculumConfigFromEnv(process.env));
  });

  it("fetches a known lesson", async () => {
    const lesson = await repository.fetch(LESSON.lessonSlug, LESSON.programmeSlug);
    expect(lesson).toMatchObject({
      identity: LESSON,
      programme: { subject: expect.any(String) },
      title: expect.any(String),
    });
    expect(lesson.title.length).toBeGreaterThan(0);
  });

  it("fails when the lesson does not exist", async () => {
    await expect(
      repository.fetch("no-such-lesson-anywhere", LESSON.programmeSlug),
    ).rejects.toBeInstanceOf(CurriculumError);
  });

  // Pairs with the test below: LESSON must be one Oak publishes a worksheet for.
  it("returns the worksheet when the lesson has one", async () => {
    const lesson = await repository.fetch(LESSON.lessonSlug, LESSON.programmeSlug);

    expect(lesson.resources).toContainEqual(
      expect.objectContaining({ type: "worksheet", url: expect.any(String) }),
    );
  });

  it("returns no worksheet when the lesson has none", async () => {
    const lesson = await repository.fetch(
      WORKSHEETLESS_LESSON.lessonSlug,
      WORKSHEETLESS_LESSON.programmeSlug,
    );

    expect(lesson.resources).not.toContainEqual(
      expect.objectContaining({ type: "worksheet" }),
    );
  });

  it("returns no content guidance when the lesson has none", async () => {
    const lesson = await repository.fetch(LESSON.lessonSlug, LESSON.programmeSlug);

    expect(lesson.contentGuidance).toEqual([]);
  });

  it("returns the content guidance for a lesson that has it", async () => {
    const lesson = await repository.fetch(
      CONTENT_GUIDANCE_LESSON.lessonSlug,
      CONTENT_GUIDANCE_LESSON.programmeSlug,
    );

    expect(lesson.contentGuidance).toEqual(
      expect.arrayContaining([
        "Depiction or discussion of discriminatory behaviour",
        "Depiction or discussion of sensitive content",
        "Depiction or discussion of violence or suffering",
      ]),
    );
  });

  it("returns the asset level restriction for a lesson", async () => {
    const lesson = await repository.fetch(
      RESTRICTED_LESSON.lessonSlug,
      RESTRICTED_LESSON.programmeSlug,
    );

    expect(lesson.maxRestrictions).toEqual([
      { category: "downloadable-files", maxLevel: "restricted" },
      { category: "media", maxLevel: "restricted" },
      { category: "quiz-images", maxLevel: "ogl-equivalent" },
    ]);
  });
});
