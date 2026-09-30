import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import { originalResourceDocumentFixtureManifest } from "@oaknational/resource-adapter-original-resource-documents/fixtures";
import { describe, expect, it } from "vitest";

import { createDevModelInvoker } from "../../ai/dev-invoker";
import { resolveApplicationMaterial } from "../../transformations/application-material-resolver";
import { worksheetScaffoldingSuggestionFlow } from "../definitions/worksheet-scaffolding";
import { generateSuggestions, suggestionMaterialRequirements } from "../service";
import type { TransformationSuggestion } from "../types";
import {
  NODE_SCAFFOLDS,
  RECALL_QUESTIONS,
  worksheetScaffoldingExpectations,
  type WorksheetExpectation,
} from "./worksheet-scaffolding.expected";

const describeEval = process.env.RUN_SUGGESTION_EVAL === "1" ? describe : describe.skip;
const RUNS = Number(process.env.SUGGESTION_EVAL_RUNS ?? "3");
const CONCURRENCY = 6;

type Cell = Readonly<{
  expected: boolean;
  kind: string;
  lessonSlug: string;
  target: string;
}>;

type CellResult = Cell & Readonly<{ reasons: readonly string[]; suggestedIn: number }>;

function expectedCells(expectation: WorksheetExpectation): Cell[] {
  const { lessonSlug } = expectation;
  const nodeCells = Object.entries(expectation.questions).flatMap(([target, wanted]) =>
    Object.entries(NODE_SCAFFOLDS).map(([scaffold, kind]) => ({
      expected: wanted.includes(scaffold as keyof typeof NODE_SCAFFOLDS),
      kind,
      lessonSlug,
      target,
    })),
  );
  return [
    ...nodeCells,
    {
      expected: expectation.recallQuestions,
      kind: RECALL_QUESTIONS,
      lessonSlug,
      target: "document",
    },
  ];
}

async function runWorksheet(expectation: WorksheetExpectation): Promise<
  Readonly<{
    runs: readonly (readonly TransformationSuggestion[])[];
    warnings: readonly string[];
  }>
> {
  const manifest = originalResourceDocumentFixtureManifest.find(
    ({ id }) => id === expectation.lessonSlug,
  );
  if (manifest === undefined || !("oakLesson" in manifest)) {
    throw new Error(`${expectation.lessonSlug} is not an Oak fixture.`);
  }
  const lesson = {
    lessonSlug: manifest.oakLesson.lessonSlug,
    programmeSlug: manifest.oakLesson.programmeSlug,
  };
  const document = await originalResourceDocuments.get({
    ...lesson,
    resourceType: "worksheet",
    source: "oak",
  });
  const { material, warnings } = await resolveApplicationMaterial(
    suggestionMaterialRequirements(worksheetScaffoldingSuggestionFlow),
    lesson,
    createDevModelInvoker,
  );
  const runs = await Promise.all(
    Array.from({ length: RUNS }, () =>
      generateSuggestions(worksheetScaffoldingSuggestionFlow, document, [], {
        correlationKey: `suggestion-eval-${expectation.lessonSlug}`,
        createInvoker: createDevModelInvoker,
        material,
      }),
    ),
  );
  return { runs, warnings };
}

async function inPool<T, R>(
  items: readonly T[],
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await run(items[index]!);
      }
    }),
  );
  return results;
}

function score(
  expectation: WorksheetExpectation,
  runs: readonly (readonly TransformationSuggestion[])[],
): CellResult[] {
  const cells = expectedCells(expectation);
  const known = new Set(cells.map(({ kind, target }) => `${kind}:${target}`));
  const unexpected = runs
    .flat()
    .map(({ kind, targetBlockId }) => ({ kind, target: targetBlockId ?? "document" }))
    .filter(({ kind, target }) => !known.has(`${kind}:${target}`))
    .map(({ kind, target }) => ({
      expected: false,
      kind,
      lessonSlug: expectation.lessonSlug,
      target,
    }));
  const unique = [
    ...cells,
    ...new Map(
      unexpected.map((cell) => [`${cell.kind}:${cell.target}`, cell]),
    ).values(),
  ];

  return unique.map((cell) => {
    const matching = runs.map((suggestions) =>
      suggestions.find(
        ({ kind, targetBlockId }) =>
          kind === cell.kind && (targetBlockId ?? "document") === cell.target,
      ),
    );
    return {
      ...cell,
      reasons: matching.flatMap((suggestion) =>
        suggestion === undefined ? [] : [suggestion.reason],
      ),
      suggestedIn: matching.filter((suggestion) => suggestion !== undefined).length,
    };
  });
}

function summarise(results: readonly CellResult[]) {
  const kinds = [...Object.values(NODE_SCAFFOLDS), RECALL_QUESTIONS];
  return kinds.map((kind) => {
    const ofKind = results.filter((cell) => cell.kind === kind);
    const wanted = ofKind.filter(({ expected }) => expected);
    const unwanted = ofKind.filter(({ expected }) => !expected);
    const hits = wanted.reduce((sum, { suggestedIn }) => sum + suggestedIn, 0);
    const wrong = unwanted.reduce((sum, { suggestedIn }) => sum + suggestedIn, 0);
    return {
      kind,
      hits,
      misses: wanted.length * RUNS - hits,
      wrong,
      recall:
        wanted.length === 0
          ? "n/a"
          : `${Math.round((hits / (wanted.length * RUNS)) * 100)}%`,
    };
  });
}

function markdownReport(results: readonly CellResult[]): string {
  const summary = summarise(results);
  const lines = [
    `# Worksheet scaffolding suggestion eval (${RUNS} runs per worksheet)`,
    "",
    "| Scaffold | Hits | Misses | Wrong | Recall |",
    "| --- | --- | --- | --- | --- |",
    ...summary.map(
      ({ hits, kind, misses, recall, wrong }) =>
        `| ${kind} | ${hits} | ${misses} | ${wrong} | ${recall} |`,
    ),
    "",
    "## Wrong suggestions",
    "",
    ...results
      .filter(({ expected, suggestedIn }) => !expected && suggestedIn > 0)
      .flatMap(({ kind, lessonSlug, reasons, suggestedIn, target }) => [
        `- **${lessonSlug}** ${target} ${kind} (${suggestedIn}/${RUNS})`,
        ...reasons.map((reason) => `  - ${reason}`),
      ]),
    "",
    "## Misses",
    "",
    ...results
      .filter(({ expected, suggestedIn }) => expected && suggestedIn < RUNS)
      .map(
        ({ kind, lessonSlug, suggestedIn, target }) =>
          `- **${lessonSlug}** ${target} ${kind} (${suggestedIn}/${RUNS})`,
      ),
  ];
  return lines.join("\n");
}

describeEval("worksheet scaffolding suggestion eval", () => {
  it(
    "matches the human scaffold decisions",
    async () => {
      const worksheets = await inPool(worksheetScaffoldingExpectations, runWorksheet);
      const results = worksheetScaffoldingExpectations.flatMap((expectation, index) =>
        score(expectation, worksheets[index]!.runs),
      );
      const warnings = worksheetScaffoldingExpectations.flatMap(
        ({ lessonSlug }, index) =>
          worksheets[index]!.warnings.map(
            (warning) => `- **${lessonSlug}** ${warning}`,
          ),
      );
      const report = [
        markdownReport(results),
        ...(warnings.length === 0 ? [] : ["", "## Material warnings", "", ...warnings]),
      ].join("\n");
      console.log(report);

      const outputDirectory = process.env.SUGGESTION_EVAL_OUT;
      if (outputDirectory !== undefined) {
        await mkdir(outputDirectory, { recursive: true });
        const stamp = new Date().toISOString().replaceAll(":", "-");
        await writeFile(join(outputDirectory, `eval-${stamp}.md`), report);
        await writeFile(
          join(outputDirectory, `eval-${stamp}.json`),
          JSON.stringify({ results, runs: RUNS, summary: summarise(results) }, null, 2),
        );
      }

      expect(results.length).toBeGreaterThan(0);
    },
    30 * 60 * 1000,
  );
});
