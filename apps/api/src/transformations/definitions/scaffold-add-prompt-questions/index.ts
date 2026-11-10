import { contentGuidanceRule } from "../../../rules/content-guidance";
import { defineTransformation } from "../../define-transformation";
import { APPLIED_ONCE_PER_TARGET_RULE } from "../../rules/common-rules";
import { promptQuestionsContribution } from "./contribution";
import { addPromptQuestionsPrompt } from "./prompt";

export const addPromptQuestionsTransformation = defineTransformation({
  kind: "scaffold-add-prompt-questions",
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
  rules: [
    APPLIED_ONCE_PER_TARGET_RULE,
    contentGuidanceRule(
      {
        id: "content-guidance",
        description:
          "Refuses recall questions on lessons with sensitive content guidance.",
      },
      {
        labels: [
          "Depiction or discussion of sexual violence",
          "Depiction or discussion of sexual content",
          "Depiction or discussion of mental health issues",
          "Depiction or discussion of serious crime",
        ],
      },
    ),
  ],
  execution: {
    strategy: "model",
    prompt: addPromptQuestionsPrompt,
    contribution: promptQuestionsContribution,
  },
});
