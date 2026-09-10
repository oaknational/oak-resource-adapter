import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchOakMaterial } from "./oak-material-api";
import type { LessonScenario } from "../../scenario-types";

const lesson: LessonScenario["lesson"] = {
  lessonSlug: "adopting-different-perspectives",
  programmeSlug: "english-primary-ks2",
  title: "Adopting different perspectives",
  subjectSlug: "english",
  keyStageSlug: "ks2",
  availableResources: ["worksheet"],
};

const part = {
  key: "lesson.keywords",
  label: "Lesson keywords",
  text: "- perspective: A point of view.",
  warnings: [],
};

function respond(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
      status,
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the Oak material harness API", () => {
  it("asks the API for one lesson's material", async () => {
    const fetchMock = respond({ parts: [part] });

    await expect(
      fetchOakMaterial(lesson, new AbortController().signal),
    ).resolves.toEqual([part]);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({
        lesson: {
          lessonSlug: "adopting-different-perspectives",
          programmeSlug: "english-primary-ks2",
        },
      }),
      method: "POST",
    });
  });

  it("keeps a part Oak did not publish, with the reason it gave", async () => {
    const absent = {
      key: "lesson.slides",
      label: "Lesson slides",
      text: null,
      warnings: ["Lesson slides is not available: no source exists yet."],
    };
    respond({ parts: [absent] });

    await expect(
      fetchOakMaterial(lesson, new AbortController().signal),
    ).resolves.toEqual([absent]);
  });

  it("surfaces the reason the API gave", async () => {
    respond({ error: "The lesson material could not be read." }, 502);

    await expect(
      fetchOakMaterial(lesson, new AbortController().signal),
    ).rejects.toThrow("The lesson material could not be read.");
  });

  it("rejects a response it cannot recognise", async () => {
    respond({ parts: [{ key: "lesson.keywords" }] });

    await expect(
      fetchOakMaterial(lesson, new AbortController().signal),
    ).rejects.toThrow("unrecognised shape");
  });
});
