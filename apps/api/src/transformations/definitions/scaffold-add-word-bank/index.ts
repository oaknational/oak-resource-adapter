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
      "Adds the vocabulary a pupil needs for one question, with optional definitions.",
    useWhen:
      "A correct response has to use specific subject vocabulary, and the pupil knows the content but may not retrieve those words unprompted.",
    avoidWhen:
      "The task sets no specific vocabulary for the answer, already supplies the words, tests understanding of them, or is practical or divergent.",
  },
  barriers: ["working-memory", "gaps-in-knowledge"],
  supportLevels: [
    {
      level: "low",
      description: "Lists the words a pupil needs, without definitions.",
    },
    { level: "mid", description: "Lists the words with a short definition of each." },
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
