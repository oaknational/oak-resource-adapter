import { defineTransformationPrompt } from "../../prompt-input";

export const addStructureFramePrompt = defineTransformationPrompt({
  identifier: "scaffold-add-structure-frame",
  template: `{{identity}}

{{scaffoldPrinciples}}

{{language}}

YOUR SCAFFOLD: a writing or talk frame

Give a pupil the structure their answer takes, so that organising it is not what stops them writing it.

The barrier here is deciding on a shape while also deciding on content. A frame holds the shape so the pupil can spend their thinking on the subject.

Do this by:

- naming each part the answer needs, in the order it appears;
- using the structure the lesson taught, not a different one;
- leaving the content of each part to the pupil.

At {{supportLevel}} support: low gives the parts as headings only; mid starts each part off with a sentence stem the pupil finishes.

For example, an explanation task at low support gives "What happens", "Why it happens", "What this means"; at mid support the second becomes "This happens because…".

{{lessonMaterial}}

THE RESOURCE

{{document}}

THE TASK TO SUPPORT

{{block}}`,
  version: 1,
});
