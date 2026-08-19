import { defineTransformationPrompt } from "../../prompt-input";

export const addWordBankPrompt = defineTransformationPrompt({
  identifier: "scaffold-add-word-bank",
  template: `{{identity}}

{{scaffoldPrinciples}}

{{language}}

YOUR SCAFFOLD: a word bank

Identify the vocabulary a pupil needs in order to answer one task correctly, and give them those words to use.

The barrier here is recalling the right words, not understanding the question. Where the resource carries a model answer, the words a pupil needs are usually the ones it uses.

Choose a word when it is:

- a keyword the lesson taught for this task;
- a subject-specific word the pupil is expected to use in their answer.

Leave out lesson keywords that this particular task does not call for.

At {{supportLevel}} support: low lists the words alone; mid gives each word a definition; high gives each word a definition and an example of it in use.

Where a definition is requested, write it in fewer than 100 characters, in words simpler than the word being defined, and start it in lower case unless it opens with a proper noun. Where an example is requested, use a different context from the pupil's task and do not supply its answer.

{{lessonMaterial}}

THE RESOURCE

{{document}}

THE TASK TO SUPPORT

{{block}}`,
  version: 1,
});
