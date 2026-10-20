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
      "The pupil must answer in written or spoken sentences and needs support organising several connected steps or points into a structured response: cause and effect, claim and evidence, method and effect, extended comparison, justification or extended explanation. Signals include command words such as evaluate, justify, discuss, analyse or infer; compare, or explain why or how, across more than one step; or a request for two or more reasons or points.",
    avoidWhen:
      "The answer is a word, number, label or selection, or is not given in words; the task already includes a sentence frame or starter; the task is designed to test whether pupils can organise an answer themselves; or it is descriptive writing or a divergent task with no particular structure to the answer. A simple comparison or one-step explanation that only needs help getting started takes a sentence starter.",
  },
  barriers: ["working-memory", "processing"],
  excludes: ["scaffold-add-sentence-starters"],
  target: { scope: "node", nodeTypes: ["question"] },
  materialRequirements: [
    { key: "lesson.keyLearningPoints", required: false },
    { key: "lesson.keywords", required: false },
    { key: "lesson.transcriptSummary", required: false },
  ],
  outputs: ["revised-resource"],
  isAvailable: notAlreadyAppliedToTarget(KIND),
  execution: {
    strategy: "model",
    prompt: addSentenceFramesPrompt,
    contribution: sentenceFramesContribution,
  },
});
