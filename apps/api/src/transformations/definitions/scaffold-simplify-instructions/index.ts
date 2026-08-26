import { always } from "../../availability";
import { defineTransformation } from "../../define-transformation";
import { simplifyInstructionsPrompt } from "./prompt";

export const simplifyInstructionsTransformation = defineTransformation({
  kind: "scaffold-simplify-instructions",
  label: "Simplify the instructions",
  status: "draft",
  suggestion: {
    description:
      "Rewrites one instruction in plainer language without changing what it asks pupils to do.",
    useWhen:
      "Sentence structure or non-essential wording makes the instruction harder to understand than the task itself.",
    avoidWhen:
      "The instruction is already concise, or its vocabulary is part of the intended subject demand.",
  },
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
