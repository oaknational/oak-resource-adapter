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
      "The response has more than one required move and the pupil can make each move but loses the shape or order of the answer across them.",
    avoidWhen:
      "The response is a single move and the pupil can make it once the syntax is opened for them.",
  },
  barriers: ["working-memory", "processing"],
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
