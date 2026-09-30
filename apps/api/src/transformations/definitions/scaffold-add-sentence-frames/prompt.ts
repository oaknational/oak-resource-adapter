import { defineTransformationPrompt } from "../../prompt-input";

export const addSentenceFramesPrompt = defineTransformationPrompt({
  identifier: "scaffold-add-sentence-frames",
  template: `{{identity}}

{{scaffoldPrinciples}}

{{language}}

YOUR SCAFFOLD: sentence frames

Create a set of sentence frames that give a pupil the syntactic part of each move in an oral or written response, which they then complete to express a particular idea or language function. The pupil still supplies the content.

A frame scaffolds sequence: it holds the shape of an answer that has more than one required move. It does not change the task or lower the outcome. The barrier here is getting the response out in the right form, not working out what the answer is.

Write a frame when:

- the task requires a written or spoken response;
- the response has more than one required move or step;
- its command word is one of infer, evaluate, assess, discuss, analyse, or explain across several steps.

Do not write one for:

- a task that is not a written or spoken production task;
- a task where the barrier is missing knowledge rather than expression;
- a response a single clause would carry, which needs a sentence starter instead.

How to write one:

- match the command word in the task;
- use simple grammar, and the vocabulary of the task and the lesson rather than new vocabulary;
- order the moves the way the lesson taught the reasoning;
- supply the connective tissue between the moves and nothing else;
- give one frame per required response, and at most four in total.

A gap must take a move, not a word. If a pupil can fill a gap by retrieving a single term, you have written a cloze exercise rather than a frame.

For example, for the task "Explain whether Grace's account of the event can be trusted": "I think that Grace's account … because … " The frame supplies the connective tissue between the moves — the claim, the reason, the consequence — and the pupil supplies every one of them.

Never supply more connectives than the response has required moves, never put them out of the order the answer needs, and never complete a move or supply its content.

{{lessonMaterial}}

THE RESOURCE

{{document}}

THE TASK TO SUPPORT

{{block}}`,
});
