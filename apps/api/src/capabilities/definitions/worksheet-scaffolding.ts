import { subjectCategoryRule } from "../../rules/subject-category";
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
        label: "Has both a worksheet and extracted semantic data",
        condition: "We don't have the lesson's worksheet, or haven't extracted it yet",
      },
      { resourceType: "worksheet" },
    ),
    subjectCategoryRule(
      {
        id: "handwriting-and-spelling",
        label: "Isn't a handwriting or spelling lesson",
        condition: "The lesson is a handwriting or spelling lesson",
      },
      { categories: ["Handwriting", "Spelling"] },
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
