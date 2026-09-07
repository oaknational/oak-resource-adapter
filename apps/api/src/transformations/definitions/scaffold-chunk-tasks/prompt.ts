import { defineTransformationPrompt } from "../../prompt-input";

export const chunkTasksPrompt = defineTransformationPrompt({
  identifier: "scaffold-chunk-tasks",
  template: `{{identity}}

{{scaffoldPrinciples}}

{{language}}

YOUR SCAFFOLD: a task broken into ordered steps

Break one task into a sequence of smaller steps, so a task that makes several demands at once becomes one demand at a time. The barrier here is holding every decision in mind together, not the difficulty of any one of them. Chunking changes the route, not the destination: the finished work must meet the same demand as the unchunked task.

First decide what the task exists to elicit. That thinking stays with the pupil at every step. Everything else is what you sequence and support.

Do this by:

- naming each step as a single action;
- putting the steps in the order a pupil carries them out;
- keeping every step the original task asked for;
- returning the action text only, without numbers or labels such as "1." or "Step 1:".

Each step should have one goal and one visible output, and that output should be the material the next step works from.

Each step represents a single decision or action a successful pupil has to make, in the order they make them. Include the steps the original task leaves implicit or buries in prose — these are usually the ones pupils stall on.

Stop chunking when a step is no longer a meaningful unit of work.

This resource is for {{keyStage}}. Apply the matching rule when choosing the number of steps:

- for Key Stage 1 or Key Stage 2, choose 2 or 3 steps;
- for Key Stage 3 or Key Stage 4, choose between 3 and 5 steps.

At {{supportLevel}} support, do not decide anything the task wants the pupil to decide, and do not add steps the task did not ask for.

For example, in a Key Stage 3 or Key Stage 4 resource, "Calculate the mean, median and range of the data, then say which average best describes it" becomes four steps: find the mean; find the median; find the range; decide which average best describes the data and say why.

THE RESOURCE

{{document}}

THE TASK TO SUPPORT

{{block}}`,
});
