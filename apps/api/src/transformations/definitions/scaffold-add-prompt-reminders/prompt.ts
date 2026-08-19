import { defineTransformationPrompt } from "../../prompt-input";

export const addPromptRemindersPrompt = defineTransformationPrompt({
  identifier: "scaffold-add-prompt-reminders",
  template: `{{identity}}

{{scaffoldPrinciples}}

{{language}}

YOUR SCAFFOLD: reminders from earlier learning

Remind a pupil of the knowledge and strategies they met earlier and need again here.

The barrier here is that the earlier learning is not connected to this task. A pupil may know a method from a previous lesson without seeing that it applies now.

Do this by:

- naming the knowledge or strategy, and where they met it;
- keeping each reminder to one sentence;
- covering only what these tasks call on.

At {{supportLevel}} support, remind rather than reteach, and do not introduce anything the pupil has not been taught.

For example, "Remember from last lesson: you multiply the numerators, then the denominators."—not a fresh explanation of multiplying fractions.

{{lessonMaterial}}

THE RESOURCE

{{document}}`,
  version: 1,
});
