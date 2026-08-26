import { always } from "../../availability";
import { defineTransformation } from "../../define-transformation";
import { addSuccessCriteriaPrompt } from "./prompt";

export const addSuccessCriteriaTransformation = defineTransformation({
  kind: "scaffold-add-success-criteria",
  label: "Add success criteria",
  status: "draft",
  suggestion: {
    description:
      "Adds concise criteria describing what a complete response should contain.",
    useWhen:
      "A complex question has several requirements that pupils must hold in mind.",
    avoidWhen:
      "The criteria are already explicit, or stating them would remove the intended reasoning.",
  },
  barriers: ["working-memory", "inhibitory-control", "gaps-in-knowledge"],
  supportLevels: [
    { level: "low", description: "States what a complete answer contains." },
    {
      level: "mid",
      description: "States what a complete answer contains, with an example of each.",
    },
  ],
  target: { scope: "node", nodeTypes: ["question"] },
  materialRequirements: [
    { key: "lesson.keyLearningPoints", required: false },
    { key: "lesson.outcome", required: false },
  ],
  outputs: ["revised-resource"],
  isAvailable: always,
  execution: {
    strategy: "model",
    prompt: addSuccessCriteriaPrompt,
  },
});
