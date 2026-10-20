import { defineTransformationPrompt } from "../../prompt-input";
import { addTaskGlossaryTransformation } from "../scaffold-add-task-glossary";
import { addTaskGlossaryPrompt } from "../scaffold-add-task-glossary/prompt";

const KIND = "scaffold-add-task-vocabulary";

/** Stored rows still name this kind; delete it with the migration that rewrites them. */
export const retiredTaskVocabularyTransformation = {
  ...addTaskGlossaryTransformation,
  kind: KIND,
  label: "Add a task vocabulary bank",
  status: "retired",
  execution: {
    ...addTaskGlossaryTransformation.execution,
    prompt: defineTransformationPrompt({
      identifier: KIND,
      template: addTaskGlossaryPrompt.template,
    }),
  },
} as const;
