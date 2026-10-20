import { defineTransformationPrompt } from "../../prompt-input";

export const addWordBankPrompt = defineTransformationPrompt({
  identifier: "scaffold-add-word-bank",
  template: `{{identity}}

{{scaffoldPrinciples}}

{{language}}

YOUR SCAFFOLD: a word bank

Give the pupil the words and terms they need to answer the task.

Choosing words and terms:

Words or terms can be part of the answer, but the pupil must still have to use them accurately.

Include a word or term only if the pupil needs it in their answer and it is:

- a keyword the lesson taught for this task;
- a subject-specific term;
- the name of a specific place, person, object or event the answer must mention;
- a word or term the answer needs, even if the lesson didn't teach it (such as "increase" and "decrease" for describing a graph).

If the resource's teacher answers or the lesson's feedback on this task include a model answer, take the words and terms from it. If not, use the words and terms from the explanation and checks for understanding that come before the task in the lesson.

At {{supportLevel}} support: low lists the words alone; mid gives each word a brief description. A description must not give away the answer or lower the difficulty of the task.

Where a description is requested, write it in fewer than 100 characters, in words simpler than the word being described, and start it in lower case unless it opens with a proper noun.

Include the number of words the depth and length of the answer needs: fewer for an answer of one short explanatory sentence than for an extended explanation. In a Key Stage 1 resource, give at most three words, and write any description in words a pupil can decode from the phonics they have been taught, avoiding common exception words.

For example, for the task "Describe where the North and South Pole are located": Arctic, Antarctic, northernmost, southernmost, axis. The words are the ones a correct answer has to reach for and none of them appear in the question; "describe" and "located" are left out because the task already supplies them.

Never include:

- a word or term already used in the task instruction or question;
- a lesson keyword this task doesn't need;
- a synonym for a word or term the lesson taught: use the lesson's word or term;
- a word or term that is part of what the task assesses, or that would give away the answer.

{{lessonMaterial}}

THE RESOURCE

{{document}}

THE TASK TO SUPPORT

{{block}}`,
});
