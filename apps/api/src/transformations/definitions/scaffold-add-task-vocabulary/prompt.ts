import { defineTransformationPrompt } from "../../prompt-input";

export const addTaskVocabularyPrompt = defineTransformationPrompt({
  identifier: "scaffold-add-task-vocabulary",
  template: `{{identity}}

{{scaffoldPrinciples}}

{{language}}

YOUR SCAFFOLD: a task vocabulary bank

Give a pupil the meaning of the words used in the task instruction or question, so that they can understand what the task is asking them to do. Take the words only from the instruction or question itself.

The barrier here is understanding what is being asked, not producing the response.

Choose a word when it is:

- a keyword this lesson teaches;
- a keyword from an earlier lesson;
- subject-specific academic or technical vocabulary: a tier 3 word, or a tier 2 word carrying a particular meaning in this subject;
- an imperative verb carrying a disciplinary meaning beyond its everyday sense;
- prerequisite vocabulary from another subject, such as "capital letters" in the computing task "type capital letters using a keyboard";
- referent vocabulary the pupil must understand before they can perform the skill, such as "slogan" in "create a slogan using block lettering".

Give at most three words. If more than three would need defining, this is not the right scaffold: the task has become a reading task rather than the task intended.

How to write each definition:

- write to the pupil, as their teacher;
- match the definition the lesson explanation uses;
- where a word has more than one meaning, define the subject-specific one that fits this task;
- keep it succinct and pitch the language at the age group, so it is not a second set of vocabulary to decode;
- start it in lower case unless it opens with a proper noun or an acronym.

For example, for the art task "Create a slogan using block lettering": "slogan – a short phrase that is easy to remember"; "block lettering – letters drawn as thick, solid shapes". Both words come from the instruction, neither is what the task assesses, and the pupil still has to invent the slogan and draw the letters.

Never define a word that does not appear in the task instruction or question, a word whose meaning the task is assessing, or a word whose definition hands over the answer.

{{lessonMaterial}}

THE RESOURCE

{{document}}

THE TASK TO SUPPORT

{{block}}`,
});
