import { notAlreadyAppliedToTarget } from "../../availability";
import { defineTransformation } from "../../define-transformation";
import { wordBankContribution } from "./contribution";
import { addWordBankPrompt } from "./prompt";

const KIND = "scaffold-add-word-bank";

export const addWordBankTransformation = defineTransformation({
  kind: KIND,
  label: "Add a word bank",
  status: "active",
  suggestion: {
    description:
      "Adds the vocabulary a pupil needs for one question, with optional definitions and examples.",
    useWhen:
      "Answering the question depends on recalling or selecting relevant subject vocabulary.",
    avoidWhen:
      "The question already supplies the vocabulary, or vocabulary is not the barrier to answering it.",
  },
  barriers: ["working-memory", "gaps-in-knowledge"],
  supportLevels: [
    {
      level: "low",
      description: "Lists the words a pupil needs, without definitions.",
    },
    { level: "mid", description: "Lists the words with a short definition of each." },
    {
      level: "high",
      description: "Lists the words with a definition and an example of each in use.",
    },
  ],
  target: { scope: "node", nodeTypes: ["question"] },
  materialRequirements: [
    { key: "lesson.slides", required: false },
    { key: "lesson.keywords", required: false },
    { key: "lesson.keyLearningPoints", required: false },
    { key: "lesson.misconceptions", required: false },
  ],
  outputs: ["revised-resource"],
  isAvailable: notAlreadyAppliedToTarget(KIND),
  execution: {
    strategy: "model",
    prompt: addWordBankPrompt,
    contribution: wordBankContribution,
  },
});
