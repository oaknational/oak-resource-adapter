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
      "The task instruction or question contains up to three words a pupil must understand before they can start, and none of those meanings is what the task is assessing.",
    avoidWhen:
      "The pupil understands what the task asks and the difficulty lies in producing the response, or the words in question are the thing being assessed.",
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
