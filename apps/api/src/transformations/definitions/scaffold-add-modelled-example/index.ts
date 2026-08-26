import { always } from "../../availability";
import { defineTransformation } from "../../define-transformation";
import { addModelledExamplePrompt } from "./prompt";

export const addModelledExampleTransformation = defineTransformation({
  kind: "scaffold-add-modelled-example",
  label: "Add a modelled example",
  status: "draft",
  suggestion: {
    description:
      "Adds a fully worked equivalent example beside one question without answering that question.",
    useWhen:
      "The pupil needs to see how a taught method is applied before completing a similar task independently.",
    avoidWhen:
      "The worksheet already includes a suitable model, or the example would reveal the answer.",
  },
  barriers: ["working-memory", "gaps-in-knowledge"],
  supportLevels: [
    { level: "high", description: "Works an equivalent example through in full." },
  ],
  target: { scope: "node", nodeTypes: ["question"] },
  materialRequirements: [
    { key: "lesson.keyLearningPoints", required: false },
    { key: "lesson.misconceptions", required: false },
  ],
  outputs: ["revised-resource"],
  isAvailable: always,
  execution: {
    strategy: "model",
    prompt: addModelledExamplePrompt,
  },
});
