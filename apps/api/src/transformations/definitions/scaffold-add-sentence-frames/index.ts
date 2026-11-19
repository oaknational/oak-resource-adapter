import { defineTransformation } from "../../define-transformation";
import { APPLIED_ONCE_PER_TARGET_RULE } from "../../rules/common-rules";
import { sentenceFramesContribution } from "./contribution";
import { addSentenceFramesPrompt } from "./prompt";

export const addSentenceFramesTransformation = defineTransformation({
  kind: "scaffold-add-sentence-frames",
  label: "Add sentence frames",
  status: "active",
  suggestion: {
    description:
      "Gives a pupil the shape of a response that has several moves, which they then complete.",
    useWhen:
      "The pupil must answer in written or spoken sentences and needs support organising several connected steps or points into a structured response.",
    avoidWhen:
      "The answer is a word, number, label or selection, or is not given in words; the task already includes a sentence frame or starter; the task is designed to test whether pupils can organise an answer themselves; or it is descriptive, creative or divergent writing, such as a story or script, even when the task names the parts it should have. A simple comparison, or a single question with one main point to make, takes a sentence starter, even when explaining that point takes a short chain of reasoning.",
  },
  barriers: ["working-memory", "processing"],
  excludes: ["scaffold-add-sentence-starters"],
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
    prompt: addSentenceFramesPrompt,
    contribution: sentenceFramesContribution,
  },
});
