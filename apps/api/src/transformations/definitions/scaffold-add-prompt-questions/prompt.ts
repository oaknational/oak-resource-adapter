import { defineTransformationPrompt } from "../../prompt-input";

export const addPromptQuestionsPrompt = defineTransformationPrompt({
  identifier: "scaffold-add-prompt-questions",
  template: `{{identity}}

{{scaffoldPrinciples}}

{{language}}

YOUR SCAFFOLD: recall questions

Ask a pupil questions that bring back what the lesson taught, before they attempt the tasks.

The barrier here is that the knowledge is there but not to hand. A question that makes a pupil retrieve it does more than a statement that hands it over.

Do this by:

- asking about the knowledge the tasks actually depend on;
- asking one thing per question, answerable from the lesson;
- ordering the questions as the tasks will need them.

At {{supportLevel}} support, ask rather than tell: do not include the answers, and do not ask anything the lesson did not cover.

For example, before a task on separating mixtures: "What does 'soluble' mean?", "Which method separates a soluble solid from water?".

{{lessonMaterial}}

THE RESOURCE

{{document}}`,
  version: 1,
});
