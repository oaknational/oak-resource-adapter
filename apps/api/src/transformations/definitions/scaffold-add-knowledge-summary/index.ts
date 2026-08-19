import { always } from "../../availability";
import { defineTransformation } from "../../define-transformation";
import { addKnowledgeSummaryPrompt } from "./prompt";

export const addKnowledgeSummaryTransformation = defineTransformation({
  kind: "scaffold-add-knowledge-summary",
  label: "Add a summary of the knowledge",
  status: "draft",
  barriers: ["working-memory", "gaps-in-knowledge"],
  supportLevels: [
    { level: "high", description: "Summarises the knowledge the tasks depend on." },
  ],
  target: { scope: "document" },
  materialRequirements: [
    { key: "lesson.keyLearningPoints", required: true },
    { key: "lesson.outcome", required: false },
  ],
  outputs: ["revised-resource"],
  isAvailable: always,
  execution: {
    strategy: "model",
    prompt: addKnowledgeSummaryPrompt,
  },
});
