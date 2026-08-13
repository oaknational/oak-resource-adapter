import { afterEach, describe, expect, it, vi } from "vitest";

import { CurriculumError } from "../errors.js";
import {
  buildLesson,
  createInMemoryLessonRepository,
} from "./in-memory-lesson-repository.js";
import {
  assetsRow,
  browseDataRow,
  contentRow,
  restrictionLevelsRow,
} from "./lesson-fixtures.js";
import type { LessonRepository } from "./lesson.js";
import { createOakLessonRepository } from "./oak-lesson-repository.js";

const theSameLesson = buildLesson();

function oakPublishesThatLesson(restrictionLevels = [restrictionLevelsRow()]): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            assets: [assetsRow()],
            browseData: [browseDataRow()],
            content: [contentRow()],
            restrictionLevels,
          },
        }),
      ),
    ),
  );
}

const implementations: ReadonlyArray<[string, () => LessonRepository]> = [
  [
    "Hasura",
    () =>
      createOakLessonRepository({
        apiKey: "test-api-key",
        endpoint: "https://curriculum.example/v1/graphql",
      }),
  ],
  ["in-memory", () => createInMemoryLessonRepository([theSameLesson])],
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each(implementations)("%s repository", (_name, build) => {
  it("fetches the lesson to the same value", async () => {
    oakPublishesThatLesson();

    await expect(build().fetch(theSameLesson.identity)).resolves.toEqual(theSameLesson);
  });

  it("reports no restrictions when no levels are recorded", async () => {
    oakPublishesThatLesson([]);

    await expect(build().fetch(theSameLesson.identity)).resolves.toMatchObject({
      maxRestrictions: [],
    });
  });

  it("refuses a blank identity without looking anything up", async () => {
    oakPublishesThatLesson();

    await expect(
      build().fetch({ lessonSlug: "  ", programmeSlug: "" }),
    ).rejects.toMatchObject({ code: "unusable-identity" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports an identity it cannot fetch as not found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: { assets: [], browseData: [], content: [], restrictionLevels: [] },
          }),
        ),
      ),
    );

    const error = await build()
      .fetch({ lessonSlug: "no-such-lesson", programmeSlug: "maths-primary-ks2" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CurriculumError);
    expect((error as CurriculumError).code).toBe("not-found");
  });
});
