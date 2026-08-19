import { always } from "../../availability";
import { defineTransformation } from "../../define-transformation";
import { chunkTasksPrompt } from "./prompt";

export const chunkTasksTransformation = defineTransformation({
  kind: "scaffold-chunk-tasks",
  label: "Break the task into ordered steps",
  status: "draft",
  barriers: ["working-memory"],
  supportLevels: [
    {
      level: "low",
      description: "Breaks the task into the steps a pupil works through in order.",
    },
  ],
  target: { scope: "node", nodeTypes: ["question"] },
  outputs: ["revised-resource"],
  isAvailable: always,
  execution: {
    strategy: "model",
    prompt: chunkTasksPrompt,
  },
});
