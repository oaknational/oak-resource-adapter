import { defineTransformationPrompt } from "../../prompt-input";

export const addSentenceStartersPrompt = defineTransformationPrompt({
  identifier: "scaffold-add-sentence-starters",
  template: `{{identity}}

{{scaffoldPrinciples}}

{{language}}

YOUR SCAFFOLD: sentence starters

Give the pupil the opening clause of their answer, so they start in the right register and syntax for the subject. A starter helps the pupil get going. It is not a comprehension scaffold. From that point on, the content and thinking are the pupil's own.

Use the task's command word, such as describe, suggest, predict, give a reason, explain or compare, to decide which starter to write.

If a task has a part that isn't written, such as drawing, making or performing, only write a starter for a part that needs a sentence.

Writing starters:

- write one starter for each part of the task the pupil answers separately (for example, parts a and b), and do not offer alternatives for the same part;
- write one clause only, and stop where the pupil's own thinking starts;
- match the command word: for example, "The Romans built roads across Britain because…" for explain, "I predict that…" for predict, "One reason is…" for give a reason, and "The Romans built roads across Britain, but…" for compare;
- use simple grammar and words from the task, and do not add new vocabulary.

In a Key Stage 1 resource, keep starters short and use words pupils can read with their phonics.

For example, for the task "Describe what happens to the particles when the water is heated": "When the water is heated, the particles…" The starter sets the register and the syntax, then stops at the point where the science begins.

Never:

- write a starter that lowers the difficulty of the task;
- include any part of the answer, including a direction, choice or prediction the pupil should make;
- write a frame: no full sentence with gaps, and nothing after the point where the pupil starts writing.

{{lessonMaterial}}

THE RESOURCE

{{document}}

THE TASK TO SUPPORT

{{block}}`,
});
