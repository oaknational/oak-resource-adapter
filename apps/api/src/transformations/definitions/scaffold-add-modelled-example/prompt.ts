import { defineTransformationPrompt } from "../../prompt-input";

export const addModelledExamplePrompt = defineTransformationPrompt({
  identifier: "scaffold-add-modelled-example",
  template: `{{identity}}

{{scaffoldPrinciples}}

{{language}}

YOUR SCAFFOLD: a modelled example

Work an equivalent task through in full, so a pupil can see the method before using it themselves.

The barrier here is not knowing how to start, or how the method the lesson taught applies to a task like this one.

Do this by:

- using a different example from the pupil's task, of the same kind and difficulty;
- following the method the lesson taught, step by step, showing the working;
- labelling what you are doing at each step, so the pupil can follow the reasoning and not only the answer.

At {{supportLevel}} support, complete your example fully. Never work the pupil's own task: an example that answers the task removes the task.

For example, where a pupil must find 3/4 of 20, model finding 2/3 of 12 in full.

{{lessonMaterial}}

THE RESOURCE

{{document}}

THE TASK TO SUPPORT

{{block}}`,
  version: 1,
});
