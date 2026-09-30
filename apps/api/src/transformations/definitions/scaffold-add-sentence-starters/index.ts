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
      "The response must be produced in continuous spoken or written prose, and the pupil has the content but stalls on getting into the right form.",
    avoidWhen:
      "The response is a word, number or selection, or the barrier is missing knowledge rather than expression.",
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
    prompt: addSentenceStartersPrompt,
    contribution: sentenceStartersContribution,
  },
});
