import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { vocabularyHandoffTable } from "./vocabulary-handoff.js";
import { resourceVocabulary } from "./vocabulary.js";

it("keeps the extraction handoff table in agreement with the vocabulary", async () => {
  const handoff = await readFile(
    new URL("../EXTRACTION_HANDOFF.md", import.meta.url),
    "utf8",
  );
  const actual = handoff
    .split("<!-- vocabulary:start -->")[1]
    ?.split("<!-- vocabulary:end -->")[0]
    ?.trim();
  const normalise = (table: string) =>
    table
      .split("\n")
      .map((line) =>
        line
          .split("|")
          .map((cell) => (/^-+$/.test(cell.trim()) ? "-" : cell.trim()))
          .join("|"),
      )
      .join("\n");
  expect(normalise(actual ?? "")).toBe(normalise(vocabularyHandoffTable()));
});

it("assigns each directive to exactly one output", () => {
  const directives = [
    ...Object.values(resourceVocabulary.nodes).flatMap(({ directives }) => directives),
    resourceVocabulary.annotations.answer.directive,
  ];
  expect(new Set(directives).size).toBe(directives.length);
});
