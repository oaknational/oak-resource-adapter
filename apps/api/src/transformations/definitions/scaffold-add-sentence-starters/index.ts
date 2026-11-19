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
      "The pupil must answer in written or spoken sentences and needs help beginning either a response they can complete in one step, such as an answer with one main point, or open or creative writing, such as a story, diary entry, letter, poem or script, where there is no fixed structure for a frame to set out.",
    avoidWhen:
      "The answer is a word, number, label, calculation or selection (state, name, identify, label, calculate, match, circle, tick), or the task is not answered in words (drawing, making, performing).",
  },
  barriers: ["working-memory", "processing"],
  excludes: ["scaffold-add-sentence-frames"],
  target: { scope: "node", nodeTypes: ["question"] },
  materialRequirements: [
    { key: "lesson.slides", required: false },
    { key: "lesson.keyLearningPoints", required: false },
    { key: "lesson.keywords", required: false },
    { key: "lesson.transcriptSummary", required: false },
  ],
  outputs: ["revised-resource"],
  rules: [APPLIED_ONCE_PER_TARGET_RULE],
  execution: {
    strategy: "model",
    prompt: addSentenceStartersPrompt,
    contribution: sentenceStartersContribution,
  },
});
