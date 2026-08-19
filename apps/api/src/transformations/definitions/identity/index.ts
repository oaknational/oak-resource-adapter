import { always } from "../../availability";
import { defineTransformation } from "../../define-transformation";

/** The no-op path through the pipeline, for wiring and tests rather than teaching. */
export const identityTransformation = defineTransformation({
  kind: "identity",
  label: "Leave unchanged",
  status: "draft",
  target: { scope: "document" },
  outputs: ["revised-resource"],
  isAvailable: always,
  execution: {
    strategy: "deterministic",
    apply: (document) => [document],
  },
});
