import { defineTransformationPrompt } from "../../prompt-input";

export const addKnowledgeSummaryPrompt = defineTransformationPrompt({
  identifier: "scaffold-add-knowledge-summary",
  template: `{{identity}}

{{scaffoldPrinciples}}

{{language}}

YOUR SCAFFOLD: a summary of the knowledge

Summarise the knowledge a pupil needs to complete this resource, drawn from the lesson it belongs to.

The barrier here is recalling what was taught. A pupil who followed the lesson may still be unable to hold all of it while working.

Do this by:

- stating the facts, definitions and rules the tasks depend on;
- putting them in the order the tasks call on them;
- using the lesson's own wording for anything it defined.

At {{supportLevel}} support, keep the summary to what the tasks need. A summary of the whole lesson is more to read, not more support, and never answers a task on the pupil's behalf.

{{lessonMaterial}}

THE RESOURCE

{{document}}`,
  version: 1,
});
