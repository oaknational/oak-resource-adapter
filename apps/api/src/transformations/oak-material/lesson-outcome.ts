import type { OakMaterialPart } from "./material";

export const lessonOutcomePart: OakMaterialPart = {
  label: "Lesson outcome",
  read: (lesson) =>
    lesson.outcome === null ? undefined : { kind: "text", text: lesson.outcome },
  render: (value) =>
    value.kind === "text"
      ? `What a pupil should be able to say they can do by the end of the lesson:

${value.text}`
      : "",
};
