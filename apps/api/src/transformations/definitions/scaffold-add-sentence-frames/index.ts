import { notAlreadyAppliedToTarget } from "../../availability";
import { defineTransformation } from "../../define-transformation";
import { sentenceFramesContribution } from "./contribution";
import { addSentenceFramesPrompt } from "./prompt";

const KIND = "scaffold-add-sentence-frames";

export const addSentenceFramesTransformation = defineTransformation({
  kind: KIND,
  label: "Add sentence frames",
  status: "active",
  suggestion: {
    description:
      "Gives a pupil the shape of a response that has several moves, which they then complete.",
    useWhen:
      "The response makes more than one required move, such as explaining and then giving a reason, drawing a conclusion from evidence, or an extended piece of writing with an expected structure.",
    avoidWhen:
      "The response makes a single move, where sentence starters fit instead, or is a word, number, label, drawing or selection.",
  },
  barriers: ["working-memory", "processing"],
  excludes: ["scaffold-add-sentence-starters"],
  target: { scope: "node", nodeTypes: ["question"] },
  materialRequirements: [
    { key: "lesson.keyLearningPoints", required: false },
    { key: "lesson.keywords", required: false },
  ],
  outputs: ["revised-resource"],
  isAvailable: notAlreadyAppliedToTarget(KIND),
  execution: {
    strategy: "model",
    prompt: addSentenceFramesPrompt,
    contribution: sentenceFramesContribution,
  },
});
