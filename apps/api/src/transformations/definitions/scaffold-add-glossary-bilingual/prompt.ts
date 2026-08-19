import { defineTransformationPrompt } from "../../prompt-input";

export const addGlossaryBilingualPrompt = defineTransformationPrompt({
  identifier: "scaffold-add-glossary-bilingual",
  template: `{{identity}}

{{scaffoldPrinciples}}

{{language}}

YOUR SCAFFOLD: a bilingual glossary

Give the resource's key vocabulary in a pupil's first language alongside English, so that the language of instruction is not what stops them.

The barrier here is the language the resource is written in, not the subject itself. A pupil who knows the content in their first language should be able to reach it here.

Choose a word when it is:

- vocabulary a pupil must understand to attempt the tasks;
- a subject term they will meet again in this unit.

Leave out everyday English a pupil is likely to hold already. Do not translate the whole resource, and do not simplify the subject content.

For example, a science resource asking pupils to "describe how the substance dissolves" needs "dissolve" and "substance" translating; it does not need "describe how" translating if the class meets that phrasing every lesson.

{{lessonMaterial}}

THE RESOURCE

{{document}}`,
  version: 1,
});
