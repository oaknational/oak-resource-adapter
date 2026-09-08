import type { OakMaterialPart } from "../material";

import {
  renderChecksForUnderstanding,
  renderLearningCycleTitles,
  renderPracticeTasksWithFeedback,
  renderTranscriptSummary,
} from "./render";
import type { TranscriptSummary } from "./schema";

export { createTranscriptSummariser } from "./invoke";

const deriveTranscriptSummary: NonNullable<OakMaterialPart["derive"]> = async (
  lesson,
  { summariseTranscript },
) => {
  if (!lesson.transcript) {
    return { failedBecause: "the lesson has no transcript" };
  }
  if (summariseTranscript === undefined) {
    return { failedBecause: "no summariser was supplied to the run" };
  }

  const summary = await summariseTranscript(lesson.transcript);

  return summary === undefined
    ? { failedBecause: "the summariser returned nothing usable" }
    : { value: { kind: "transcriptSummary", summary } };
};

function transcriptSummaryPart(
  label: string,
  render: (summary: TranscriptSummary) => string,
): OakMaterialPart {
  return {
    label,
    read: null,
    derive: deriveTranscriptSummary,
    render: (value) =>
      value.kind === "transcriptSummary" ? render(value.summary) : "",
  };
}

export const lessonTranscriptSummaryPart = transcriptSummaryPart(
  "Lesson transcript summary",
  renderTranscriptSummary,
);

export const lessonTranscriptSummaryLearningCycleTitlesPart = transcriptSummaryPart(
  "Learning cycle titles",
  renderLearningCycleTitles,
);

export const lessonTranscriptSummaryPracticeTasksWithFeedbackPart =
  transcriptSummaryPart(
    "Practice tasks with feedback",
    renderPracticeTasksWithFeedback,
  );

export const lessonTranscriptSummaryChecksForUnderstandingPart = transcriptSummaryPart(
  "Checks for understanding",
  renderChecksForUnderstanding,
);
