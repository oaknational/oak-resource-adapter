import { defineTransformationPrompt } from "../../prompt-input";

export const addGlossaryQuestionPrompt = defineTransformationPrompt({
  identifier: "scaffold-add-glossary-question",
  template: `{{identity}}

{{scaffoldPrinciples}}

{{language}}

YOUR SCAFFOLD: a question glossary

Identify the vocabulary in one task's wording that could stop a pupil understanding what the task is asking, and define each word.

The barrier here is understanding the question, not answering it. Define only what a pupil needs to read the task: anything else is load they do not need.

Choose a word when it is:

- a keyword the lesson teaches;
- a keyword from an earlier lesson in the unit;
- a subject-specific word whose everyday meaning would mislead a pupil.

For example, in "Summarise three key features of limestone", "limestone" is a lesson keyword, and "features" is an everyday word carrying a specific meaning in geography. Both need defining. "Summarise" would need defining only if the lesson had not taught it.

Write each definition in fewer than 100 characters, in words simpler than the word being defined, and start it in lower case unless it opens with a proper noun.

{{lessonMaterial}}

THE RESOURCE

{{document}}

THE TASK TO SUPPORT

{{block}}`,
  version: 1,
});
