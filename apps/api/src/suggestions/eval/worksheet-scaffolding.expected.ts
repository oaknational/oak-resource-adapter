import type { RegisteredTransformationKind } from "../../transformations/registry";

export const NODE_SCAFFOLDS = {
  frames: "scaffold-add-sentence-frames",
  starters: "scaffold-add-sentence-starters",
  taskGlossary: "scaffold-add-task-glossary",
  wordBank: "scaffold-add-word-bank",
} as const satisfies Record<string, RegisteredTransformationKind>;

export type NodeScaffold = keyof typeof NODE_SCAFFOLDS;

export type WorksheetExpectation = Readonly<{
  lessonSlug: string;
  /** Every question node in the fixture; an empty list expects no node scaffold. */
  questions: Readonly<Record<string, readonly NodeScaffold[]>>;
}>;

/**
 * The human decisions from the suggestion-agent review sheet. Verbal prompts are
 * left out because ORA has no such scaffold. A task with no question node in the
 * fixture (air resistance task A) cannot be targeted.
 */
export const worksheetScaffoldingExpectations: readonly WorksheetExpectation[] = [
  {
    lessonSlug: "adopting-different-perspectives",
    questions: {
      "question-1": ["taskGlossary", "frames"],
      "question-2": ["taskGlossary", "frames"],
    },
  },
  {
    lessonSlug:
      "explain-how-the-quotient-is-affected-when-the-divisor-is-equal-to-the-dividend",
    questions: {
      "question-1": [],
      "question-2": [],
      "question-3": [],
      "question-4": [],
      "question-5": [],
      "question-6": [],
    },
  },
  {
    lessonSlug: "forming-ions-for-ionic-bonding",
    questions: {
      "question-1": [],
      "question-2": ["wordBank", "starters"],
      "question-3": [],
    },
  },
  {
    lessonSlug: "using-trace-tables",
    questions: {
      "question-1": ["wordBank", "frames"],
      "question-2": ["taskGlossary"],
    },
  },
  {
    lessonSlug: "air-resistance-do-and-review",
    questions: {
      "question-1": ["taskGlossary", "wordBank", "frames"],
    },
  },
  {
    lessonSlug: "the-river-nile",
    questions: {
      "question-1": [],
      "question-2": ["starters"],
      "question-3": ["taskGlossary", "frames"],
    },
  },
];
