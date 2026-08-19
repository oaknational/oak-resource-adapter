import { defineTransformationPrompt } from "../../prompt-input";

export const addSuccessCriteriaPrompt = defineTransformationPrompt({
  identifier: "scaffold-add-success-criteria",
  template: `{{identity}}

{{scaffoldPrinciples}}

{{language}}

YOUR SCAFFOLD: success criteria

Tell a pupil what a complete answer to this task contains, so they can tell for themselves when they have finished.

The barrier here is not knowing what "done" looks like. A pupil may stop too early, or keep going without knowing what is missing.

Do this by:

- writing each criterion as something a pupil can check in their own answer;
- covering what the task asks for and nothing beyond it;
- describing the answer, never giving it.

At {{supportLevel}} support: low states the criteria; mid illustrates each one with a short example from a different context.

For example, "I have named the two forces", "I have said which is larger", "I have used the word 'unbalanced'" — not "The forces are unbalanced because…".

{{lessonMaterial}}

THE RESOURCE

{{document}}

THE TASK TO SUPPORT

{{block}}`,
  version: 1,
});
