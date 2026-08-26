import type { OakMaterialPart } from "./material";

/**
 * The nearest thing to the lesson explanation in text: what the teacher says in
 * Oak's video. A whole transcript is a large prompt for little control over what
 * it contains, so no transformation declares it; prefer a part that says exactly
 * what it carries.
 */
export const lessonTranscriptPart: OakMaterialPart = {
  label: "Lesson transcript",
  read: (lesson) =>
    lesson.transcript === null ? undefined : { kind: "text", text: lesson.transcript },
  render: (value) =>
    value.kind === "text"
      ? `What the teacher says while teaching this lesson:

${value.text}`
      : "",
};
