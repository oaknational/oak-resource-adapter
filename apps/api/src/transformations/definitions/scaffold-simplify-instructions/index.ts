import { always } from "../../availability";
import { defineTransformation } from "../../define-transformation";
import { simplifyInstructionsPrompt } from "./prompt";

export const simplifyInstructionsTransformation = defineTransformation({
  kind: "scaffold-simplify-instructions",
  label: "Simplify the instructions",
  status: "draft",
  barriers: ["working-memory", "inhibitory-control", "processing", "gaps-in-knowledge"],
  supportLevels: [
    {
      level: "mid",
      description:
        "Rewrites the instruction in plainer language, keeping what it asks for.",
    },
  ],
  target: { scope: "node", nodeTypes: ["question"] },
  outputs: ["revised-resource"],
  isAvailable: always,
  execution: {
    strategy: "model",
    prompt: simplifyInstructionsPrompt,
  },
});
