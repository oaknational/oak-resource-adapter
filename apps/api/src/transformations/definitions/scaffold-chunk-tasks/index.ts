import { all, notAlreadyAppliedToTarget } from "../../availability";
import { defineTransformation } from "../../define-transformation";
import { chunkTasksContribution, supportsChunkingKeyStage } from "./contribution";
import { chunkTasksPrompt } from "./prompt";

const KIND = "scaffold-chunk-tasks";

export const chunkTasksTransformation = defineTransformation({
  kind: KIND,
  label: "Break the task into ordered steps",
  status: "active",
  suggestion: {
    description: "Breaks one multi-stage task into a short sequence of ordered steps.",
    useWhen:
      "Completing the task requires pupils to coordinate several explicit actions in order.",
    avoidWhen:
      "The task is already chunked, or deciding the sequence is part of the intended challenge.",
  },
  barriers: ["working-memory"],
  supportLevels: [
    {
      level: "low",
      description: "Breaks the task into the steps a pupil works through in order.",
    },
  ],
  target: { scope: "node", nodeTypes: ["question"] },
  outputs: ["revised-resource"],
  isAvailable: all(
    ({ document }) => supportsChunkingKeyStage(document),
    notAlreadyAppliedToTarget(KIND),
  ),
  execution: {
    strategy: "model",
    prompt: chunkTasksPrompt,
    contribution: chunkTasksContribution,
  },
});
