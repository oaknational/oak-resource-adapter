import { excludedLessonsRule } from "../../rules/excluded-lessons";
import { resourceInputsRule } from "../resource-inputs";
import type { CapabilityDefinition } from "../types";

export const worksheetScaffoldingCapability = {
  id: "worksheetScaffolding",
  label: "Add extra scaffolding",
  resourceType: "worksheet",
  rules: [
    resourceInputsRule(
      {
        id: "resource-inputs",
        description:
          "Refuses a lesson unless Oak publishes its worksheet and we hold an extracted copy.",
      },
      { resourceType: "worksheet" },
    ),
    excludedLessonsRule(
      {
        id: "handwriting-and-spelling",
        description: "Refuses English primary handwriting and spelling lessons.",
      },
      { lessonSlugs: [] },
    ),
  ],
  suggestionFlowId: "worksheet-scaffolding",
  transformationKinds: [
    "scaffold-add-word-bank",
    "scaffold-add-task-glossary",
    "scaffold-add-prompt-questions",
    "scaffold-add-sentence-starters",
    "scaffold-add-sentence-frames",
    "scaffold-chunk-tasks",
  ],
} as const satisfies CapabilityDefinition;
