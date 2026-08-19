import { always } from "../../availability";
import { defineTransformation } from "../../define-transformation";
import { addStructureFramePrompt } from "./prompt";

export const addStructureFrameTransformation = defineTransformation({
  kind: "scaffold-add-structure-frame",
  label: "Add a writing frame",
  status: "draft",
  barriers: ["working-memory", "cognitive-flexibility"],
  supportLevels: [
    {
      level: "low",
      description: "Gives the structure to write within, with headings only.",
    },
    { level: "mid", description: "Gives the structure with each section started off." },
  ],
  target: { scope: "node", nodeTypes: ["question"] },
  materialRequirements: [{ key: "lesson.keyLearningPoints", required: false }],
  outputs: ["revised-resource"],
  isAvailable: always,
  execution: {
    strategy: "model",
    prompt: addStructureFramePrompt,
  },
});
