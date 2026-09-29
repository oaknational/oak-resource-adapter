import type { RegisteredTransformationKind } from "../../transformations/registry";

export const NODE_SCAFFOLDS = {
  frames: "scaffold-add-sentence-frames",
  starters: "scaffold-add-sentence-starters",
  taskVocabulary: "scaffold-add-task-vocabulary",
  wordBank: "scaffold-add-word-bank",
} as const satisfies Record<string, RegisteredTransformationKind>;

export const RECALL_QUESTIONS = "scaffold-add-prompt-questions";

export type NodeScaffold = keyof typeof NODE_SCAFFOLDS;

export type WorksheetExpectation = Readonly<{
  lessonSlug: string;
  /** Every question node in the fixture; an empty list expects no node scaffold. */
  questions: Readonly<Record<string, readonly NodeScaffold[]>>;
  recallQuestions: boolean;
}>;

/**
 * The human decisions from the suggestion-agent review sheet. Verbal prompts are
 * left out because ORA has no such scaffold. Tasks with no question node in the
 * fixture (air resistance task A, rhythmic variation task C) cannot be targeted.
 */
export const worksheetScaffoldingExpectations: readonly WorksheetExpectation[] = [
  {
    lessonSlug: "adopting-different-perspectives",
    questions: {
      "question-1": ["taskVocabulary", "frames"],
      "question-2": ["taskVocabulary", "frames"],
    },
    recallQuestions: false,
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
    recallQuestions: false,
  },
  {
    lessonSlug: "forming-ions-for-ionic-bonding",
    questions: {
      "question-1": [],
      "question-2": ["wordBank", "starters"],
      "question-3": [],
    },
    recallQuestions: true,
  },
  {
    lessonSlug: "using-trace-tables",
    questions: {
      "question-1": ["wordBank", "frames"],
      "question-2": ["taskVocabulary"],
    },
    recallQuestions: true,
  },
  {
    lessonSlug: "accidents-and-emergencies-er-verbs-in-the-perfect-tense-with-etre",
    questions: {
      "question-1": [],
      "question-2": ["taskVocabulary"],
    },
    recallQuestions: false,
  },
  {
    lessonSlug: "actions-to-tackle-climate-change",
    questions: {
      "question-1": ["taskVocabulary", "starters"],
      "question-2": ["taskVocabulary", "frames"],
    },
    recallQuestions: true,
  },
  {
    lessonSlug: "air-resistance-do-and-review",
    questions: {
      "question-1": ["taskVocabulary", "wordBank", "frames"],
    },
    recallQuestions: false,
  },
  {
    lessonSlug: "the-river-nile",
    questions: {
      "question-1": [],
      "question-2": ["starters"],
      "question-3": ["taskVocabulary", "frames"],
    },
    recallQuestions: true,
  },
  {
    lessonSlug: "adrenaline-thyroxine-and-negative-feedback",
    questions: {
      "question-1": ["taskVocabulary", "wordBank", "starters"],
      "question-2": ["taskVocabulary", "starters"],
    },
    recallQuestions: true,
  },
  {
    lessonSlug: "adding-rhythmic-variation-to-ground-bass",
    questions: {
      "question-1": ["taskVocabulary"],
    },
    recallQuestions: true,
  },
];
