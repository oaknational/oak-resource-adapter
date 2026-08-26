import { always } from "../../availability";
import { defineTransformation } from "../../define-transformation";
import { addPromptRemindersPrompt } from "./prompt";

export const addPromptRemindersTransformation = defineTransformation({
  kind: "scaffold-add-prompt-reminders",
  label: "Add reminders from earlier lessons",
  status: "draft",
  suggestion: {
    description:
      "Adds brief reminders of relevant knowledge and strategies from earlier lessons.",
    useWhen:
      "The worksheet relies on prior learning that pupils may need cued while working.",
    avoidWhen:
      "The necessary prior learning is already visible, or the reminder would introduce an untaught method.",
  },
  supportLevels: [
    {
      level: "low",
      description: "Reminds a pupil of knowledge and strategies from earlier lessons.",
    },
  ],
  target: { scope: "document" },
  materialRequirements: [
    { key: "lesson.keyLearningPoints", required: true },
    { key: "lesson.keywords", required: false },
  ],
  outputs: ["revised-resource"],
  isAvailable: always,
  execution: {
    strategy: "model",
    prompt: addPromptRemindersPrompt,
  },
});
