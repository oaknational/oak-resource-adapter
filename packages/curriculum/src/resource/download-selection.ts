import type { LessonResourceType } from "./resource.js";

/**
 * The downloads API names resources by format and calls the starter quiz the
 * intro quiz, so each of our types maps to one of its `selection` values and to
 * the filename it gives that resource inside the zip.
 *
 * `worksheet-answers` is the one type with no selection of its own: asking for
 * `worksheet-pdf` returns the questions and the answers together, and the name
 * in the zip is what tells them apart.
 */
type DownloadSelection = Readonly<{
  selection: string;
  pathInZip: string;
  contentType: string;
}>;

const PDF = "application/pdf";
const PPTX =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export const DOWNLOAD_SELECTIONS: Readonly<
  Record<LessonResourceType, DownloadSelection>
> = {
  "exit-quiz": {
    selection: "exit-quiz-questions",
    pathInZip: "exit-quiz-questions.pdf",
    contentType: PDF,
  },
  "exit-quiz-answers": {
    selection: "exit-quiz-answers",
    pathInZip: "exit-quiz-answers.pdf",
    contentType: PDF,
  },
  "lesson-guide": {
    selection: "lesson-guide-pdf",
    pathInZip: "lesson-guide.pdf",
    contentType: PDF,
  },
  "slide-deck": {
    selection: "presentation",
    pathInZip: "slide-deck.pptx",
    contentType: PPTX,
  },
  "starter-quiz": {
    selection: "intro-quiz-questions",
    pathInZip: "starter-quiz-questions.pdf",
    contentType: PDF,
  },
  "starter-quiz-answers": {
    selection: "intro-quiz-answers",
    pathInZip: "starter-quiz-answers.pdf",
    contentType: PDF,
  },
  supplementary: {
    selection: "supplementary-pdf",
    pathInZip: "additional-materials.pdf",
    contentType: PDF,
  },
  worksheet: {
    selection: "worksheet-pdf-questions",
    pathInZip: "worksheet-questions.pdf",
    contentType: PDF,
  },
  "worksheet-answers": {
    selection: "worksheet-pdf",
    pathInZip: "worksheet-answers.pdf",
    contentType: PDF,
  },
};
