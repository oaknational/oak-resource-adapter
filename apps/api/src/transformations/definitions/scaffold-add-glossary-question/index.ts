import { notAlreadyAppliedToTarget } from "../../availability";
import { defineTransformation } from "../../define-transformation";
import { glossaryContribution } from "./contribution";
import { addGlossaryQuestionPrompt } from "./prompt";

const KIND = "scaffold-add-glossary-question";

export const addGlossaryQuestionTransformation = defineTransformation({
  kind: KIND,
  label: "Explain the words in this question",
  status: "active",
  suggestion: {
    description:
      "Defines words in one question that may prevent a pupil from understanding what it asks.",
    useWhen:
      "A question contains essential subject or instructional words whose meaning is not explained nearby.",
    avoidWhen:
      "The words are already defined, or understanding them is part of the knowledge being assessed.",
  },
  barriers: ["gaps-in-knowledge", "working-memory"],
  supportLevels: [
    {
      level: "low",
      description:
        "Defines the words in the question that could block understanding it.",
    },
  ],
  target: { scope: "node", nodeTypes: ["question"] },
  materialRequirements: [
    { key: "lesson.slides", required: false },
    { key: "lesson.keywords", required: false },
  ],
  outputs: ["revised-resource"],
  isAvailable: notAlreadyAppliedToTarget(KIND),
  execution: {
    strategy: "model",
    prompt: addGlossaryQuestionPrompt,
    contribution: glossaryContribution,
  },
});
