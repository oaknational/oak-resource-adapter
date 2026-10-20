import { defineTransformationPrompt } from "../../prompt-input";

export const addSentenceFramesPrompt = defineTransformationPrompt({
  identifier: "scaffold-add-sentence-frames",
  template: `{{identity}}

{{scaffoldPrinciples}}

{{language}}

YOUR SCAFFOLD: sentence frames

Give the pupil a sentence frame for an answer that connects two or more ideas in a specific way. The frame gives the structure of the whole answer: it sets out the syntactic skeleton of the whole response. The pupil supplies the content of every step.

It is a production scaffold, not a comprehension one, for a pupil who knows what they want to say but finds it hard to organise an answer with more than one step.

To decide what frame to write, consider how the task asks the pupil to connect ideas:

- Claim and evidence. "What does Source A suggest about working conditions in factories? Use the source to support your answer." asks the pupil to connect their inference from the source to their claim: "Source A suggests ___ because it states that ___."
- Method and effect. "How does the tempo of this piece affect its mood?" asks the pupil to identify the tempo and explain how it affects the mood: "The composer uses ___, which creates ___."
- Cause and effect. "Explain what happens to the pressure of a gas in a sealed container when it is heated." asks the pupil to connect the cause (heating the gas) to its effect: "When the temperature increases, ___, so the ___."
- Comparison. "Compare how the two poets present the theme of loss." asks the pupil to find similarities and differences between the two poets: "Both poets present the theme of loss as ___, but in ___, whereas in ___."
- Justification. "Is tourism good for coastal towns? Give reasons for your answer." asks the pupil to connect their point of view with evidence that supports it: "I think tourism is ___ for coastal towns because ___. Another reason is ___."
- Extended explanation. "Explain how an oxbow lake forms." asks the pupil to explain several cause-and-effect steps in order: "An oxbow lake begins as ___, then it ___. After that, ___."

For answers longer than one paragraph, frame the first paragraph only. If a task has a part that isn't written, such as drawing, making or performing, only write a frame for a part that needs it.

To decide which ideas or steps the frame includes, use the resource's teacher answers or the lesson's feedback on this task if they include a model answer. If not, use the explanation and checks for understanding that come before the task in the lesson.

Writing frames:

- write one frame for each part of the task the pupil answers separately (for example, parts a and b), and do not offer alternatives for the same part;
- give one gap for each step in the pupil's thinking, in the order the answer needs them;
- use connecting words that fit how the steps relate, such as "because", "so" or "however";
- do not change what the task asks the pupil to do;
- keep the wording no harder to read than the task itself, though connecting words the subject and key stage expect, such as "whereas" or "consequently" at Key Stage 4, are fine.

In a Key Stage 1 resource, words taken from the task are fine even if they are harder to decode.

Never:

- write a frame that replaces the pupil's thinking;
- include any part of the answer, including a direction, choice or judgement the pupil should make;
- write a gap-fill: every gap must need the pupil's own idea, not just a recalled word or term;
- add more gaps than the answer has steps, or set the steps out in an order that doesn't make sense for the answer (for example, a result before its cause).

{{lessonMaterial}}

THE RESOURCE

{{document}}

THE TASK TO SUPPORT

{{block}}`,
});
