import { defineTransformationPrompt } from "../../prompt-input";

export const addPromptQuestionsPrompt = defineTransformationPrompt({
  identifier: "scaffold-add-prompt-questions",
  template: `{{identity}}

{{scaffoldPrinciples}}

{{language}}

YOUR SCAFFOLD: recall questions

Create up to three questions prompting pupils to recall information needed to complete the task.

The question set can either be knowledge-based or sequence-based, depending on the task focus. Questions must not directly tell pupils what the knowledge is or how to complete the task.

Think: if a pupil gave a poor or incorrect response, would this be primarily because:

a) they lacked a fact, term or concept
b) they missed, mis-ordered or badly executed a step.

If a, create a set of questions to prompt pupils to recall specific knowledge.
If b, create a set of questions to prompt pupils to recall the correct sequence of completing the skill, process or method.

Where the resource carries a model answer, the correct knowledge or sequence is usually contained within it.

At {{supportLevel}} support, ask rather than tell: do not include the answers, and do not ask anything the lesson did not cover.

For example, before a task on separating mixtures: "What does 'soluble' mean?", "Which method separates a soluble solid from water?".

{{lessonMaterial}}

THE RESOURCE

{{document}}`,
});
