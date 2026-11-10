import { defineTransformation } from "../../define-transformation";
import { keyStageRule } from "../../rules/key-stage";
import { APPLIED_ONCE_PER_TARGET_RULE } from "../../rules/common-rules";
import { CHUNKING_KEY_STAGES, chunkTasksContribution } from "./contribution";
import { chunkTasksPrompt } from "./prompt";

export const chunkTasksTransformation = defineTransformation({
  kind: "scaffold-chunk-tasks",
  label: "Break the task into ordered steps",
  status: "retired",
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
      label: "Break the task into ordered steps",
      description: "Breaks the task into the steps a pupil works through in order.",
    },
  ],
  target: { scope: "node", nodeTypes: ["question"] },
  outputs: ["revised-resource"],
  rules: [
    keyStageRule(
      {
        id: "key-stage",
        label: "Is for a key stage with a step range",
        condition: "The resource isn't for one of these key stages",
      },
      { keyStageSlugs: CHUNKING_KEY_STAGES },
    ),
    APPLIED_ONCE_PER_TARGET_RULE,
  ],
  execution: {
    strategy: "model",
    prompt: chunkTasksPrompt,
    contribution: chunkTasksContribution,
  },
});
