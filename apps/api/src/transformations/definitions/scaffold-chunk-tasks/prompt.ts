import { defineTransformationPrompt } from "../../prompt-input";

export const chunkTasksPrompt = defineTransformationPrompt({
  identifier: "scaffold-chunk-tasks",
  template: `{{identity}}

{{scaffoldPrinciples}}

{{language}}

YOUR SCAFFOLD: a task broken into ordered steps

Break one multi-step task into the steps a pupil works through, in order.

The barrier here is holding several steps in mind at once. A pupil who can do each step may still stall when the task asks for all of them together.

Do this by:

- naming each step as a single action;
- putting the steps in the order a pupil carries them out;
- keeping every step the original task asked for.

At {{supportLevel}} support, do not decide anything the task wants the pupil to decide, and do not add steps the task did not ask for.

For example, "Calculate the mean, median and range of the data, then say which average best describes it" becomes four steps: find the mean; find the median; find the range; decide which average best describes the data and say why.

THE RESOURCE

{{document}}

THE TASK TO SUPPORT

{{block}}`,
  version: 1,
});
