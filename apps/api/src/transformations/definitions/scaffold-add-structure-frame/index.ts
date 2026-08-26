import { always } from "../../availability";
import { defineTransformation } from "../../define-transformation";
import { addStructureFramePrompt } from "./prompt";

export const addStructureFrameTransformation = defineTransformation({
  kind: "scaffold-add-structure-frame",
  label: "Add a writing frame",
  status: "draft",
  suggestion: {
    description:
      "Adds headings or sentence starts that structure an extended written response.",
    useWhen:
      "A question requires a multi-part written response and organising it is an unnecessary barrier.",
    avoidWhen:
      "The response is short, the structure is already supplied, or choosing a structure is being assessed.",
  },
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
