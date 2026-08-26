import type { OakMaterialPart } from "./material";

export const lessonKeyLearningPointsPart: OakMaterialPart = {
  label: "Key learning points",
  read: (lesson) =>
    lesson.keyLearningPoints.length === 0
      ? undefined
      : {
          kind: "text",
          text: lesson.keyLearningPoints.map((point) => `- ${point}`).join("\n"),
        },
  render: (value) =>
    value.kind === "text"
      ? `The knowledge this lesson teaches, in Oak's own words:

${value.text}`
      : "",
};
