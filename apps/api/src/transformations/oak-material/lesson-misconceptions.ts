import type { OakMaterialPart } from "./material";

export const lessonMisconceptionsPart: OakMaterialPart = {
  label: "Misconceptions",
  read: (lesson) =>
    lesson.misconceptions.length === 0
      ? undefined
      : {
          kind: "text",
          text: lesson.misconceptions
            .map(({ misconception, response }) => `- ${misconception} → ${response}`)
            .join("\n"),
        },
  render: (value) =>
    value.kind === "text"
      ? `Mistakes Oak expects pupils to make in this lesson, and how a teacher answers them:

${value.text}`
      : "",
};
