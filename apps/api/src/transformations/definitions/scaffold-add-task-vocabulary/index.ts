import { notAlreadyAppliedToTarget } from "../../availability";
import { defineTransformation } from "../../define-transformation";
import { taskVocabularyContribution } from "./contribution";
import { addTaskVocabularyPrompt } from "./prompt";

const KIND = "scaffold-add-task-vocabulary";

export const addTaskVocabularyTransformation = defineTransformation({
  kind: KIND,
  label: "Add a task vocabulary bank",
  status: "active",
  suggestion: {
    description:
      "Defines the words in one task's wording that a pupil must understand before they can start.",
    useWhen:
      "The task instruction or question uses up to three words, including command words such as explain, describe, compare or justify, that pupils of this age may not reliably understand, and knowing what they mean is needed to know what to do.",
    avoidWhen:
      "The task asks pupils to define, translate or otherwise show they know those words, or the instruction uses only everyday words pupils of this age will know.",
  },
  barriers: ["gaps-in-knowledge", "working-memory"],
  target: { scope: "node", nodeTypes: ["question"] },
  materialRequirements: [
    { key: "lesson.slides", required: false },
    { key: "lesson.keywords", required: false },
    { key: "lesson.keyLearningPoints", required: false },
  ],
  outputs: ["revised-resource"],
  isAvailable: notAlreadyAppliedToTarget(KIND),
  execution: {
    strategy: "model",
    prompt: addTaskVocabularyPrompt,
    contribution: taskVocabularyContribution,
  },
});
