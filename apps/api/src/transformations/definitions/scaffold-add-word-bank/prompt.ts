import { defineTransformationPrompt } from "../../prompt-input";

export const addWordBankPrompt = defineTransformationPrompt({
  identifier: "scaffold-add-word-bank",
  template: `{{identity}}

{{scaffoldPrinciples}}

{{language}}

YOUR SCAFFOLD: a word bank

Identify the vocabulary a pupil needs in order to answer one task correctly or to help develop thinking, and give them those words to use.

The barrier here is recalling the right words that are needed, not understanding the question. Where the resource carries a model answer, the words a pupil needs are usually the ones it uses.

Choose a word when it is:

- a keyword the lesson taught for this task;
- a subject-specific word the pupil is expected to use in their answer;
- a referential noun the pupil is expected to use in their answer.

Leave out lesson keywords that this particular task does not call for. Include only vocabulary that the task instruction or question does not already use.

At {{supportLevel}} support: low lists the words alone; mid gives each word a brief description. A description must not give away the answer or lower the difficulty of the task.

Where a description is requested, write it in fewer than 100 characters, in words simpler than the word being described, and start it in lower case unless it opens with a proper noun.

In a Key Stage 1 resource, give at most three words, and write any description in words a pupil can decode from the phonics they have been taught, avoiding common exception words.

For example, for the task "Describe where the North and South Pole are located": Arctic, Antarctic, northernmost, southernmost, axis. The words are the ones a correct answer has to reach for and none of them appear in the question; "describe" and "located" are left out because the task already supplies them.

Never bank vocabulary when the task is assessing understanding of that vocabulary, and never let the bank carry the knowledge or reasoning that constitutes the answer.

{{lessonMaterial}}

THE RESOURCE

{{document}}

THE TASK TO SUPPORT

{{block}}`,
});
