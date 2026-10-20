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
      "The pupil needs to recall knowledge that is not included in the task instruction or question. A poor response would most likely come from the pupil not retrieving a fact, term or step the task leaves implicit, and the task instruction carries no prompts of its own.",
    avoidWhen:
      "There is no specific knowledge pupils need to recall, or the task instruction already itemises what to include or supplies bracketed prompts.",
  },
  barriers: ["working-memory", "gaps-in-knowledge"],
  target: { scope: "document" },
  materialRequirements: [
    { key: "lesson.keyLearningPoints", required: true },
    { key: "lesson.slides", required: false },
    { key: "lesson.transcriptSummary", required: false },
  ],
  outputs: ["revised-resource"],
  isAvailable: notAlreadyApplied(KIND),
  execution: {
    strategy: "model",
    prompt: addPromptQuestionsPrompt,
    contribution: promptQuestionsContribution,
  },
});
