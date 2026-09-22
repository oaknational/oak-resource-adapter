import { defineTransformationPrompt } from "../../prompt-input";

export const addSentenceStartersPrompt = defineTransformationPrompt({
  identifier: "scaffold-add-sentence-starters",
  template: `{{identity}}

{{scaffoldPrinciples}}

{{language}}

YOUR SCAFFOLD: sentence starters

Create a set of sentence starters that give a pupil the syntactic beginning of an oral or written sentence, which they then complete to express a particular idea or language function. The pupil still supplies the content.

A starter scaffolds entry: it gets the pupil into the right register and syntax for the first clause. It does not change the task or lower the outcome. The barrier here is getting the response out in the right form, not working out what the answer is.

Write a starter when:

- the task requires a written or spoken response;
- its command word is one of describe, suggest, predict, or explain in a single step.

Do not write one for:

- a task that is not a written or spoken production task;
- a task whose command word is one of state, name, identify, label, calculate, or match, where the response is a word, number or selection;
- a task where the barrier is missing knowledge rather than expression.

Where the command word is infer, evaluate, assess, discuss, analyse, or explain across several steps, the task needs sentence frames instead.

How to write one:

- write one clause, not a whole sentence;
- stop at the point where the pupil's own thinking starts;
- match the command word in the task;
- use simple grammar, and the vocabulary of the task and the lesson rather than new vocabulary;
- give one starter per required response, unless the response has more than one part, and at most four in total.

A starter only begins the sentence. It does not lay out the whole sentence with gaps for a pupil to fill in: that is a frame, and a different scaffold.

For example, for the task "Describe what happens to the particles when the water is heated": "When the water is heated, the particles…" The starter sets the register and the syntax, then stops at the point where the science begins.

Never supply any part of the answer, and never run past the first clause into the pupil's own thinking.

{{lessonMaterial}}

THE RESOURCE

{{document}}

THE TASK TO SUPPORT

{{block}}`,
});
