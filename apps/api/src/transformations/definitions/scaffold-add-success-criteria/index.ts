import { always } from "../../availability";
import { defineTransformation } from "../../define-transformation";
import { addSuccessCriteriaPrompt } from "./prompt";

export const addSuccessCriteriaTransformation = defineTransformation({
  kind: "scaffold-add-success-criteria",
  label: "Add success criteria",
  status: "draft",
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
