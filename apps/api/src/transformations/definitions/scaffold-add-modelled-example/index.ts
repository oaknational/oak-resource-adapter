import { always } from "../../availability";
import { defineTransformation } from "../../define-transformation";
import { addModelledExamplePrompt } from "./prompt";

export const addModelledExampleTransformation = defineTransformation({
  kind: "scaffold-add-modelled-example",
  label: "Add a modelled example",
  status: "draft",
  barriers: ["working-memory", "gaps-in-knowledge"],
  supportLevels: [
    { level: "high", description: "Works an equivalent example through in full." },
  ],
  target: { scope: "node", nodeTypes: ["question"] },
  materialRequirements: [
    { key: "lesson.keyLearningPoints", required: false },
    { key: "lesson.misconceptions", required: false },
  ],
  outputs: ["revised-resource"],
  isAvailable: always,
  execution: {
    strategy: "model",
    prompt: addModelledExamplePrompt,
  },
});
