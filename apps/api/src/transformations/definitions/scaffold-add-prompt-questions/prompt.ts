import { defineTransformationPrompt } from "../../prompt-input";

export const addPromptQuestionsPrompt = defineTransformationPrompt({
  identifier: "scaffold-add-prompt-questions",
  template: `{{identity}}

{{scaffoldPrinciples}}

{{language}}

YOUR SCAFFOLD: recall questions

Create a set of questions prompting a pupil to recall the declarative, substantive or procedural knowledge needed to complete the task. The questions may make knowledge that is implicit in the task explicit to the pupil, or prompt them to recall the prerequisite knowledge they need. Do not assume a pupil will know that this knowledge has to be recalled.

The set is either knowledge-based or sequence-based, depending on the task. Ask yourself: if a pupil gave a poor or incorrect response, would that primarily be because

- they lacked a fact, term or concept, or
- they missed, mis-ordered or badly executed a step?

For the first, prompt the pupil to recall the specific knowledge. For the second, prompt them to recall the correct sequence for completing the skill, process or method.

Questions must not tell the pupil what the knowledge is or how to complete the task. Where the resource carries a model answer, the correct knowledge or sequence is usually contained within it.

How to write them:

- make each question different from the task instruction or question, not a rewording of it;
- prompt only knowledge directly related to answering the task;
- use simple present tense, familiar vocabulary and simple syntax, so the question is not itself a load;
- put one idea in each question;
- write at most three questions, matching the number to the age of the pupil and what the task asks for.

Where the lesson's own checks for understanding are given, keep to the knowledge they establish the lesson taught, and let them set the pitch and phrasing a question of this kind takes. Where its practice task and feedback are given, take the sequence from them.

For example, for the task "Explain why the plant left in the cupboard grew poorly": "What do plants need to make their own food?"; "Where does light come from in a classroom?"; "What happens to a plant that does not get enough light?"

For the task "Add 3/4 and 2/3": "What do you look at first when you add two fractions?"; "What do you do when the denominators are different?"; "What happens to the numerators once the denominators match?"

Never state the fact, term or step inside a question, and never introduce vocabulary, knowledge or a strategy the task and lesson do not already use.

{{lessonMaterial}}

THE RESOURCE

{{document}}`,
});
