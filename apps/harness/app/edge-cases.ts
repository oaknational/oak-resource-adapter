import {
  createOriginalResourceDocumentReader,
  OriginalResourceDocumentError,
  originalResourceDocuments,
} from "@oaknational/resource-adapter-original-resource-documents";

import type {
  EdgeCase,
  EdgeCaseFact,
  EdgeCaseNavigationItem,
  ExtractionDiagnostic,
} from "./scenario-types";
import type { LessonContext } from "@oaknational/resource-adapter";

const worksheetLocator = {
  source: "oak",
  lessonSlug: "edge-case",
  programmeSlug: "edge-case",
  resourceType: "worksheet",
} as const;

function readerFor(markup: string) {
  return createOriginalResourceDocumentReader({
    getMarkup: () => Promise.resolve(markup),
    listExtractedResourceTypes: () => Promise.resolve(["worksheet"]),
  });
}

/**
 * Held here rather than in the corpus: those fixtures are provisional markup that
 * gets regenerated from real extractions, at which point they should carry no
 * diagnostics at all. This case has to keep behaving the same way regardless.
 */
const futureDirectiveMarkup = `---
markup-version: "0.1"
schema-version: "0.1"
profile: "worksheet.v0"
document-id: "synthetic:future-directive:pupil"
language: "en-GB"
title: "A worksheet using a directive this version predates"
source-system: "harness-edge-case"
source-id: "future-directive"
producer: "harness"
producer-version: "0.1.0"
---

:::oak-question {id="question-1" number="1" marks="2"}
Name the three states of matter.
:::

:::oak-future-widget {id="future-widget" formula="H2O"}
Drag the atoms together to build a water molecule.
:::
`;

type EdgeCaseDetail = Readonly<{
  facts: readonly EdgeCaseFact[];
  diagnostics: readonly ExtractionDiagnostic[];
  unsupportedNodeIds: readonly string[];
}>;

async function readFutureDirectiveMarkup(): Promise<EdgeCaseDetail> {
  const document = await readerFor(futureDirectiveMarkup).get(worksheetLocator);

  return {
    facts: [
      {
        term: "Questions we could still read",
        value: String(
          document.content.filter((node) => node.type === "question").length,
        ),
      },
    ],
    diagnostics: document.diagnostics.map((diagnostic) => ({
      category: diagnostic.category,
      severity: diagnostic.severity,
      message: diagnostic.message,
      nodeId: diagnostic.nodeId ?? null,
    })),
    unsupportedNodeIds: document.content
      .filter((node) => node.type === "unsupported")
      .map((node) => node.id),
  };
}

function factsOnly(facts: readonly EdgeCaseFact[]): EdgeCaseDetail {
  return { facts, diagnostics: [], unsupportedNodeIds: [] };
}

/**
 * Only a provider can produce markup the reader cannot parse, so the cases that
 * need one compose their own rather than the corpus-backed default.
 */
async function readUnparseableMarkup(): Promise<EdgeCaseDetail> {
  try {
    await readerFor("An extraction that forgot its frontmatter.").get(worksheetLocator);
  } catch (error) {
    if (error instanceof OriginalResourceDocumentError) {
      return factsOnly([
        { term: "Error type", value: error.code },
        { term: "What we report", value: error.message },
        {
          term: "Underlying reason",
          value: (error.cause as Error | undefined)?.message ?? "none",
        },
      ]);
    }

    throw error;
  }

  throw new Error("The malformed edge case parsed, so it no longer tests anything.");
}

async function extractionFacts(lesson: LessonContext): Promise<EdgeCaseDetail> {
  const extracted = await originalResourceDocuments.listExtractedResourceTypes({
    source: "oak",
    lessonSlug: lesson.lessonSlug,
    programmeSlug: lesson.programmeSlug,
  });

  return factsOnly([
    { term: "Lesson", value: lesson.lessonSlug },
    { term: "Resources Oak offers", value: lesson.availableResources.join(", ") },
    {
      term: "Worksheet data we hold",
      value: extracted.length === 0 ? "None" : extracted.join(", "),
    },
  ]);
}

const edgeCaseDefinitions = [
  {
    id: "worksheet-without-extraction",
    title: "Oak has a worksheet, we have no data for it",
    summary: "Oak offers a worksheet, but we have not extracted its contents.",
    expectation: "Expected: nothing appears",
    reason:
      "Aila needs two things to adapt a worksheet: the original file from Oak, and our own extracted copy of what is inside it. Here only the Oak file exists, so teachers should see no Create more button.",
    lesson: {
      lessonSlug: "adding-fractions",
      programmeSlug: "maths-primary-ks2",
      title: "Adding fractions",
      subjectSlug: "maths",
      keyStageSlug: "ks2",
      availableResources: ["worksheet"],
    },
    brokenApiPath: false,
    facts: extractionFacts,
  },
  {
    id: "extraction-without-worksheet",
    title: "We have worksheet data, Oak has no worksheet",
    summary: "We hold extracted worksheet data for a lesson that offers no worksheet.",
    expectation: "Expected: nothing appears",
    reason:
      "The other way round: we hold the extracted data, but this lesson only offers a starter quiz. There is no worksheet for Aila to adapt, so teachers should see no Create more button.",
    lesson: {
      lessonSlug: "using-trace-tables",
      programmeSlug: "computing-secondary-ks4-gcse-aqa",
      title: "Using trace tables",
      subjectSlug: "computing",
      keyStageSlug: "ks4",
      availableResources: ["starter-quiz"],
    },
    brokenApiPath: false,
    facts: extractionFacts,
  },
  {
    id: "unsupported-markup",
    title: "Worksheet data uses a feature we do not recognise",
    summary:
      "The worksheet data contains something this version was not built to read.",
    expectation: "Expected: Create more still appears",
    reason:
      "Worksheet data may contain features added after this release. We keep those parts and show a warning rather than dropping them or failing, and the worksheet can still be adapted.",
    lesson: {
      lessonSlug: "adopting-different-perspectives",
      programmeSlug: "english-primary-ks2",
      title: "Adopting different perspectives",
      subjectSlug: "english",
      keyStageSlug: "ks2",
      availableResources: ["worksheet"],
    },
    brokenApiPath: false,
    facts: readFutureDirectiveMarkup,
  },
  {
    id: "malformed-extraction",
    title: "Worksheet data we cannot read at all",
    summary: "The worksheet data is unreadable.",
    expectation: "Expected: Create more still appears, which is worth questioning",
    reason:
      "The worksheet data is damaged. We report a clear error instead of crashing. Create more still appears, because we do not open the worksheet data before offering the button, so a teacher would only hit the problem afterwards.",
    lesson: {
      lessonSlug: "adopting-different-perspectives",
      programmeSlug: "english-primary-ks2",
      title: "Adopting different perspectives",
      subjectSlug: "english",
      keyStageSlug: "ks2",
      availableResources: ["worksheet"],
    },
    brokenApiPath: false,
    facts: readUnparseableMarkup,
  },
  {
    id: "capabilities-unavailable",
    title: "Our service cannot be reached",
    summary: "The lesson page cannot reach Resource Adapter at all.",
    expectation: "Expected: a Try again message",
    reason:
      "If our service is down or unreachable, teachers should see a short message with a Try again button, rather than a blank space or a broken page.",
    lesson: {
      lessonSlug: "adopting-different-perspectives",
      programmeSlug: "english-primary-ks2",
      title: "Adopting different perspectives",
      subjectSlug: "english",
      keyStageSlug: "ks2",
      availableResources: ["worksheet"],
    },
    brokenApiPath: true,
    facts: (lesson: LessonContext) =>
      Promise.resolve(
        factsOnly([
          { term: "Lesson", value: lesson.lessonSlug },
          {
            term: "Service address",
            value: "deliberately pointed somewhere that does not exist",
          },
        ]),
      ),
  },
] as const;

export const edgeCaseNavigation: readonly EdgeCaseNavigationItem[] =
  edgeCaseDefinitions.map(({ id, summary, title }) => ({ id, title, summary }));

export async function loadEdgeCase(id: string): Promise<EdgeCase> {
  const definition = edgeCaseDefinitions.find((candidate) => candidate.id === id);

  if (definition === undefined) {
    throw new Error(`Unknown edge case ${JSON.stringify(id)}.`);
  }

  const { facts, ...edgeCase } = definition;

  return { ...edgeCase, ...(await facts(edgeCase.lesson)) };
}
