import { describe, expect, it } from "vitest";

import { buildLesson } from "./in-memory-lesson-repository.js";
import { findLessonResource } from "../resource/resource.js";

describe("findLessonResource", () => {
  it("finds a resource the lesson publishes", () => {
    expect(findLessonResource(buildLesson(), "worksheet")).toMatchObject({
      type: "worksheet",
    });
  });

  it("finds nothing for a resource the lesson does not publish", () => {
    expect(findLessonResource(buildLesson(), "slide-deck")).toBeUndefined();
  });
});
