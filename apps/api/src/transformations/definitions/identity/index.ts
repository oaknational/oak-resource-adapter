import { always } from "../../availability";
import { defineTransformation } from "../../define-transformation";

/** The no-op path through the pipeline, for wiring and tests rather than teaching. */
export const identityTransformation = defineTransformation({
  kind: "identity",
  label: "Leave unchanged",
  status: "draft",
  suggestion: {
    description: "Leaves the resource unchanged.",
    useWhen: "No scaffold would improve access to the task.",
    avoidWhen: "A specific barrier can be addressed by an available scaffold.",
  },
  target: { scope: "document" },
  outputs: ["revised-resource"],
  isAvailable: always,
  execution: {
    strategy: "deterministic",
    apply: (document) => [document],
  },
});
