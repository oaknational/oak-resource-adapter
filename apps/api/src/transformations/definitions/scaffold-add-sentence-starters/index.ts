import { defineTransformation } from "../../define-transformation";
import { APPLIED_ONCE_PER_TARGET_RULE } from "../../rules/common-rules";
import { sentenceStartersContribution } from "./contribution";
import { addSentenceStartersPrompt } from "./prompt";

export const addSentenceStartersTransformation = defineTransformation({
  kind: "scaffold-add-sentence-starters",
  label: "Add sentence starters",
  status: "active",
  suggestion: {
    description:
      "Gives a pupil the opening clause of a written or spoken response, which they then complete.",
    useWhen:
      "The pupil must answer in written or spoken sentences and needs help beginning a response they can complete in one step. Signals include describe, suggest, predict and give a reason. A simple comparison or one-step explanation, including a simple cause-and-effect explanation, can take a starter.",
    avoidWhen:
      "The answer is a word, number, label, calculation or selection (state, name, identify, label, calculate, match, circle, tick), or the task is not answered in words (drawing, making, performing). The pupil needs support organising several connected steps or points into a structured response, where sentence frames fit instead.",
  },
  barriers: ["working-memory", "processing"],
  excludes: ["scaffold-add-sentence-frames"],
  target: { scope: "node", nodeTypes: ["question"] },
  materialRequirements: [
    { key: "lesson.keyLearningPoints", required: false },
    { key: "lesson.keywords", required: false },
  ],
  outputs: ["revised-resource"],
  rules: [APPLIED_ONCE_PER_TARGET_RULE],
  execution: {
    strategy: "model",
    prompt: addSentenceStartersPrompt,
    contribution: sentenceStartersContribution,
  },
});
