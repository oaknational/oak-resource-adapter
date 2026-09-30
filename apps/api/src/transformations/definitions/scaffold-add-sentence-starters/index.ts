import { notAlreadyAppliedToTarget } from "../../availability";
import { defineTransformation } from "../../define-transformation";
import { sentenceStartersContribution } from "./contribution";
import { addSentenceStartersPrompt } from "./prompt";

const KIND = "scaffold-add-sentence-starters";

export const addSentenceStartersTransformation = defineTransformation({
  kind: KIND,
  label: "Add sentence starters",
  status: "active",
  suggestion: {
    description:
      "Gives a pupil the opening clause of a written or spoken response, which they then complete.",
    useWhen:
      "The response is spoken or written prose that makes a single move, such as a short explanation, a description or a one-step reason.",
    avoidWhen:
      "The response is a word, number, label, drawing or selection, or it makes several moves, where sentence frames fit instead.",
  },
  barriers: ["working-memory", "processing"],
  excludes: ["scaffold-add-sentence-frames"],
  target: { scope: "node", nodeTypes: ["question"] },
  materialRequirements: [
    { key: "lesson.keyLearningPoints", required: false },
    { key: "lesson.keywords", required: false },
  ],
  outputs: ["revised-resource"],
  isAvailable: notAlreadyAppliedToTarget(KIND),
  execution: {
    strategy: "model",
    prompt: addSentenceStartersPrompt,
    contribution: sentenceStartersContribution,
  },
});
