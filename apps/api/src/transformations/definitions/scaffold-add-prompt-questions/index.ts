import { notAlreadyAppliedToTarget } from "../../availability";
import { defineTransformation } from "../../define-transformation";
import { promptQuestionsContribution } from "./contribution";
import { addPromptQuestionsPrompt } from "./prompt";

const KIND = "scaffold-add-prompt-questions";

export const addPromptQuestionsTransformation = defineTransformation({
  kind: KIND,
  label: "Add recall questions",
  status: "active",
  suggestion: {
    description:
      "Adds questions at the start of a task that prompt pupils to recall the lesson knowledge it needs.",
    offer: "always",
    reason: "Prompt pupils to recall what they need before they start this task.",
  },
  barriers: ["working-memory", "gaps-in-knowledge"],
  target: { scope: "node", nodeTypes: ["task"] },
  materialRequirements: [
    { key: "lesson.keyLearningPoints", required: true },
    { key: "lesson.slides", required: false },
    { key: "lesson.transcriptSummary", required: false },
  ],
  outputs: ["revised-resource"],
  isAvailable: notAlreadyAppliedToTarget(KIND),
  execution: {
    strategy: "model",
    prompt: addPromptQuestionsPrompt,
    contribution: promptQuestionsContribution,
  },
});
