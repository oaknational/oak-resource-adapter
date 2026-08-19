import { always } from "../../availability";
import { defineTransformation } from "../../define-transformation";
import { addPromptQuestionsPrompt } from "./prompt";

export const addPromptQuestionsTransformation = defineTransformation({
  kind: "scaffold-add-prompt-questions",
  label: "Add recall questions",
  status: "draft",
  barriers: ["working-memory", "gaps-in-knowledge"],
  supportLevels: [
    {
      level: "low",
      description:
        "Asks a pupil to recall what the lesson taught, without telling them.",
    },
  ],
  target: { scope: "document" },
  materialRequirements: [
    { key: "lesson.keyLearningPoints", required: true },
    { key: "lesson.slides", required: false },
  ],
  outputs: ["revised-resource"],
  isAvailable: always,
  execution: {
    strategy: "model",
    prompt: addPromptQuestionsPrompt,
  },
});
