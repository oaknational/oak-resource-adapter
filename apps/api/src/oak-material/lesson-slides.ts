import type { OakMaterialPart } from "./material";

/**
 * Whole deck or nothing until slide extraction exists; a precise part, such as
 * the feedback slide a word bank wants, becomes its own key at that point.
 */
export const lessonSlidesPart: OakMaterialPart = {
  label: "Lesson slides",
  read: null,
  render: (value) => (value.kind === "text" ? value.text : ""),
  unavailableBecause:
    "Slide content is not extracted yet, so there is no slide text to send.",
};
