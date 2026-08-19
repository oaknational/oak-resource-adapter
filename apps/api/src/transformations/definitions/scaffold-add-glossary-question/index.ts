import { notAlreadyAppliedToTarget } from "../../availability";
import { defineTransformation } from "../../define-transformation";
import { glossaryContribution } from "./contribution";
import { addGlossaryQuestionPrompt } from "./prompt";

const KIND = "scaffold-add-glossary-question";

export const addGlossaryQuestionTransformation = defineTransformation({
  kind: KIND,
  label: "Explain the words in this question",
  status: "active",
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
