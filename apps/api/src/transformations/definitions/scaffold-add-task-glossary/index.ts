import { notAlreadyAppliedToTarget } from "../../availability";
import { defineTransformation } from "../../define-transformation";
import { taskGlossaryContribution } from "./contribution";
import { addTaskGlossaryPrompt } from "./prompt";

const KIND = "scaffold-add-task-glossary";

export const addTaskGlossaryTransformation = defineTransformation({
  kind: KIND,
  label: "Add a task glossary",
  status: "active",
  suggestion: {
    description:
      "Defines the words in one task's wording that a pupil must understand before they can start.",
    useWhen:
      "The task instruction or question contains vocabulary a pupil must understand before they can attempt the task, and that meaning is not the thing the task is assessing. This can be offered alongside scaffolds that support producing the response.",
    avoidWhen:
      "The instruction contains no lesson keywords, subject-specific terms, instruction words with a subject meaning or other words a pupil must understand to start; knowing the meaning of the word is what the task assesses; or defining the word would give away the answer.",
  },
  barriers: ["gaps-in-knowledge", "working-memory"],
  target: { scope: "node", nodeTypes: ["question"] },
  materialRequirements: [
    { key: "lesson.slides", required: false },
    { key: "lesson.keywords", required: false },
    { key: "lesson.keyLearningPoints", required: false },
    { key: "lesson.transcriptSummary", required: false },
  ],
  outputs: ["revised-resource"],
  isAvailable: notAlreadyAppliedToTarget(KIND),
  execution: {
    strategy: "model",
    prompt: addTaskGlossaryPrompt,
    contribution: taskGlossaryContribution,
  },
});
