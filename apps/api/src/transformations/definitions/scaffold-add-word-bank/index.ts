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
      "The pupil is expected to write or say an answer, and a good answer would use subject-specific words, lesson keywords or naming nouns that the task instruction does not already give them. If the resource has a model answer, check it: subject words in the model answer that are not in the question are a strong signal to offer this scaffold. If there is no model answer, check the lesson's key learning points.",
    avoidWhen:
      "The response is a single word, number, label or selection; a good answer needs no particular vocabulary; the words needed already appear in the task, a word bank or a labelled diagram on the page; or the task asks pupils to define or explain the meaning of those words.",
  },
  barriers: ["working-memory", "gaps-in-knowledge"],
  supportLevels: [
    {
      level: "low",
      label: "Add a word bank",
      description: "Lists the words a pupil needs, without definitions.",
    },
    {
      level: "mid",
      label: "Add a word bank with definitions",
      description: "Lists the words with a short definition of each.",
    },
  ],
  target: { scope: "node", nodeTypes: ["question"] },
  materialRequirements: [
    { key: "lesson.slides", required: false },
    { key: "lesson.keywords", required: false },
    { key: "lesson.keyLearningPoints", required: false },
    { key: "lesson.misconceptions", required: false },
    { key: "lesson.transcriptSummary", required: false },
  ],
  outputs: ["revised-resource"],
  isAvailable: notAlreadyAppliedToTarget(KIND),
  execution: {
    strategy: "model",
    prompt: addWordBankPrompt,
    contribution: wordBankContribution,
  },
});
