import { notAlreadyApplied } from "../../availability";
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
      "Adds questions that prompt pupils to recall relevant lesson knowledge.",
    useWhen:
      "Specific declarative, substantive or procedural knowledge has to be recalled to respond to the task, and the task instruction carries no prompts of its own.",
    avoidWhen:
      "The task is creative or divergent with no particular knowledge to recall, the instruction already itemises what to include, or the barrier is producing the response rather than recalling what it rests on.",
  },
  barriers: ["working-memory", "gaps-in-knowledge"],
  target: { scope: "document" },
  materialRequirements: [
    { key: "lesson.keyLearningPoints", required: true },
    { key: "lesson.slides", required: false },
    { key: "lesson.transcriptSummary.checksForUnderstanding", required: false },
    { key: "lesson.transcriptSummary.practiceTasksWithFeedback", required: false },
  ],
  outputs: ["revised-resource"],
  isAvailable: notAlreadyApplied(KIND),
  execution: {
    strategy: "model",
    prompt: addPromptQuestionsPrompt,
    contribution: promptQuestionsContribution,
  },
});
