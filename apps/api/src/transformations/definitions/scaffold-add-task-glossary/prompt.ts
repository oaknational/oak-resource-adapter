import { defineTransformationPrompt } from "../../prompt-input";

export const addTaskGlossaryPrompt = defineTransformationPrompt({
  identifier: "scaffold-add-task-glossary",
  template: `{{identity}}

{{scaffoldPrinciples}}

{{language}}

YOUR SCAFFOLD: a task glossary

Define words and terms from the task instruction or question, so the pupil can understand what the task is asking them to do. It is a comprehension scaffold.

Choosing words and terms:

Only define words or terms that appear in the task instruction or question, including any sub-questions or instructions the pupil will need to understand. Define one only if it is:

- a keyword from this lesson or a previous lesson;
- a subject-specific word or term, or an everyday word with a particular meaning in this subject;
- an instruction word with a subject meaning (for example, evaluate, annotate, sketch);
- a word or term from another subject the task relies on (for example, "capital letters" in a computing task);
- a word or term naming the thing the pupil must act on (for example, "slogan" in "create a slogan using block lettering").

Writing definitions:

- use the definition from the lesson explanation, and if there isn't one, write a definition that fits this task;
- if a word has more than one meaning, define the one that fits this subject and task;
- keep definitions succinct and appropriate to the age and phase of the pupil;
- start each definition in lower case unless it opens with a proper noun or an acronym.

Define as many words as the pupil needs to understand the task instruction or question. In a Key Stage 1 resource, define at most three.

For example, for the art task "Create a slogan using block lettering", define:

- slogan – a short phrase that is easy to remember;
- block lettering – letters drawn as thick, solid shapes.

For the biology task 'Andeep says: "Negative feedback is only used in the body when certain conditions increase. The body detects this increase and then decreases levels, reversing the change." What is correct and what has he misunderstood?', define:

- negative feedback – a mechanism where changes to conditions cause an action to reverse the change, keeping conditions stable;
- conditions – the state of things inside the body;
- detects – notices or senses a change;
- reversing – changing something back to how it was before.

Never define:

- a word that does not appear in the task instruction or question;
- a word whose meaning the task is assessing;
- a word whose definition would give the pupil the answer;
- an everyday word used in its everyday sense;
- a person's name;
- a word that appears only in a quotation, unless the pupil needs it to understand the quotation.

{{lessonMaterial}}

THE RESOURCE

{{document}}

THE TASK TO SUPPORT

{{block}}`,
});
