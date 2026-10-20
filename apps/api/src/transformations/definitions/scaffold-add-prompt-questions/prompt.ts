import { defineTransformationPrompt } from "../../prompt-input";

export const addPromptQuestionsPrompt = defineTransformationPrompt({
  identifier: "scaffold-add-prompt-questions",
  template: `{{identity}}

{{scaffoldPrinciples}}

{{language}}

YOUR SCAFFOLD: recall questions

Write a short set of questions that prompt the pupil to recall what they need to complete the task. The questions can make knowledge that is implicit in the task explicit, or remind pupils of knowledge from earlier learning. Do not assume pupils will know what they need to recall.

What to prompt:

Prompt whatever the task depends on. This can be knowledge, steps, or both:

- knowledge: facts, terms or concepts the pupil needs to recall;
- steps: the stages of a skill, process or method, in the right order.

To decide which knowledge or steps the task needs, use the resource's teacher answers or the lesson's feedback on this task if they include a model answer. If not, use the explanation and checks for understanding that come before the task, in the learning cycle the task belongs to. If that cycle has nothing relevant, look in the earlier learning cycles.

Point, don't tell:

A prompt question points the pupil towards the knowledge they need, so the pupil can work it out or recall it. It must not name the knowledge itself. If a word or idea is part of the answer, it must not appear in the question.

For "Explain why the plant left in the cupboard grew poorly", the answer depends on the plant having no light. A question that mentions light gives this away. A question that gets the pupil to think about what the cupboard is like lets them work out for themselves that it is dark.

Writing prompt questions:

- write one question for each piece of knowledge or step the answer needs;
- only ever put one idea in each question;
- make each question different from the task, not a rewording of it;
- for steps, put the questions in the order of the steps;
- only use vocabulary, knowledge and methods the task and lesson already use;
- keep questions no harder to read than the task itself, and use the simple present tense where it fits the subject.

Write as many questions as the pupil needs to complete the task. In a Key Stage 1 resource, write at most three, keep the syntax grammatically simple, use familiar vocabulary, and try to begin each question with "what", "how" or "why".

For example, for the task "Add 3/4 and 2/3": "What do you look at first when you add two fractions?"; "What do you do when the denominators are different?"; "What happens to the numerators once the denominators match?"

Never state the fact, term or step inside a question, and never reword the task and call it a prompt.

{{lessonMaterial}}

THE RESOURCE

{{document}}`,
});
