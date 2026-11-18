import { defineTransformation } from "../../define-transformation";
import { APPLIED_ONCE_PER_TARGET_RULE } from "../../rules/common-rules";
import { wordBankContribution } from "./contribution";
import { addWordBankPrompt } from "./prompt";

export const addWordBankTransformation = defineTransformation({
  kind: "scaffold-add-word-bank",
  label: "Add a word bank",
  status: "active",
  suggestion: {
    description: "Adds the vocabulary a pupil needs for one question.",
    useWhen:
      "The pupil writes or says an answer in their own words, such as sentences, notes, a list, an account or a retelling, and a good answer would use subject-specific words, lesson keywords or the names of places, people, objects or events that the task does not already give them. The words can be part of the answer, as long as the pupil still has to use them accurately. If the resource has a model answer, check it: subject words in the model answer that are not in the question are a strong signal to offer this scaffold. If there is no model answer, check the lesson's keywords and key learning points.",
    avoidWhen:
      "The response is a single word, number, label or selection (notes or a list of points are not); a good answer needs no particular vocabulary; or the task asks pupils to define or explain the meaning of those words.",
  },
  barriers: ["working-memory", "gaps-in-knowledge"],
  supportLevels: [
    {
      level: "low",
      label: "Add a word bank",
      description: "Lists the words a pupil needs, without definitions.",
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
  rules: [APPLIED_ONCE_PER_TARGET_RULE],
  execution: {
    strategy: "model",
    prompt: addWordBankPrompt,
    contribution: wordBankContribution,
  },
});
