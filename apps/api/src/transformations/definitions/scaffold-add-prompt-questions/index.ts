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
      "Pupils need help retrieving taught knowledge before applying it across the worksheet.",
    avoidWhen:
      "The worksheet already prompts recall, or the questions would supply the answers.",
  },
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
  isAvailable: notAlreadyApplied(KIND),
  execution: {
    strategy: "model",
    prompt: addPromptQuestionsPrompt,
    contribution: promptQuestionsContribution,
  },
});
