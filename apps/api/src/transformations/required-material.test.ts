import { describe, expect, it } from "vitest";

import { assertRequiredMaterial } from "./required-material";

const keywords = [
  { keyword: "perspective", description: "the position a story is told from" },
];

describe("assertRequiredMaterial", () => {
  it("accepts a request carrying what a kind requires", () => {
    expect(() =>
      assertRequiredMaterial(
        "test-kind",
        [{ key: "lesson.keywords", required: true }],
        {
          "lesson.keywords": { kind: "keywords", keywords },
        },
      ),
    ).not.toThrow();
  });

  it("rejects a request missing a required part, and says why it is missing", () => {
    expect(() =>
      assertRequiredMaterial(
        "test-kind",
        [{ key: "lesson.slides", required: true }],
        {},
      ),
    ).toThrow(/lesson\.slides \(Slide content is not extracted yet/);
  });

  it("ignores an absent optional part", () => {
    expect(() =>
      assertRequiredMaterial(
        "test-kind",
        [{ key: "lesson.keywords", required: false }],
        {},
      ),
    ).not.toThrow();
  });
});
