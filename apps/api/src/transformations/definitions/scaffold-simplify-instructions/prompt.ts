import { defineTransformationPrompt } from "../../prompt-input";

export const simplifyInstructionsPrompt = defineTransformationPrompt({
  identifier: "scaffold-simplify-instructions",
  template: `{{identity}}

{{scaffoldPrinciples}}

{{language}}

YOUR SCAFFOLD: a simplified instruction

Rewrite one task's instruction so that reading it costs a pupil less, without changing what it asks them to do.

The barrier here is the wording of the instruction. Long sentences, several clauses, and words that carry no meaning for the task all take working memory a pupil needs for the task itself.

Do this by:

- splitting a sentence that asks for more than one thing;
- putting the steps in the order a pupil does them;
- removing words that add no instruction;
- keeping the subject vocabulary the lesson is teaching, even where it is hard.

At {{supportLevel}} support, keep every part of what the task demands: an instruction a pupil can read but that asks for less is not a scaffold.

For example, "Using the information in the table above, and thinking carefully about what you have learned this lesson, explain why the population changed" becomes "Look at the table. Explain why the population changed."—the same task, less to read.

THE RESOURCE

{{document}}

THE TASK TO SUPPORT

{{block}}`,
  version: 1,
});
