import { always } from "../../availability";
import { defineTransformation } from "../../define-transformation";
import { addGlossaryBilingualPrompt } from "./prompt";

export const addGlossaryBilingualTransformation = defineTransformation({
  kind: "scaffold-add-glossary-bilingual",
  label: "Add a bilingual glossary",
  status: "draft",
  barriers: ["language-of-instruction"],
  supportLevels: [
    {
      level: "low",
      description:
        "Gives the key vocabulary in a pupil's first language alongside English.",
    },
  ],
  target: { scope: "document" },
  materialRequirements: [
    { key: "lesson.slides", required: false },
    { key: "lesson.outcome", required: false },
    { key: "lesson.keywords", required: false },
    { key: "lesson.keyLearningPoints", required: false },
    { key: "lesson.misconceptions", required: false },
  ],
  outputs: ["revised-resource"],
  isAvailable: always,
  execution: {
    strategy: "model",
    prompt: addGlossaryBilingualPrompt,
  },
});
