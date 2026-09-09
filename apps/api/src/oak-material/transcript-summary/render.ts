import type { TranscriptSummary } from "./schema";

type LearningCycle = TranscriptSummary["learningCycles"][number];
type CheckForUnderstanding = LearningCycle["checksForUnderstanding"][number];

function bulletList(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

function section(heading: string, body: string | undefined): string | undefined {
  return body === undefined ? undefined : `${heading}\n${body}`;
}

function listSection(
  heading: string,
  items: readonly string[] | null,
): string | undefined {
  return section(
    heading,
    items === null || items.length === 0 ? undefined : bulletList(items),
  );
}

function renderCheck(check: CheckForUnderstanding): string {
  const answers = [
    check.expectedAnswer === null
      ? undefined
      : `Expected answer: ${check.expectedAnswer}`,
    check.teacherResponse === null
      ? undefined
      : `Teacher's response: ${check.teacherResponse}`,
  ].filter((answer) => answer !== undefined);

  return [`- ${check.question}`, ...answers.map((answer) => `  - ${answer}`)].join(
    "\n",
  );
}

function cycleHeading(cycle: LearningCycle, index: number): string {
  return `Cycle ${index + 1}: ${cycle.title}`;
}

function renderCycle(cycle: LearningCycle, index: number): string {
  const parts = [
    cycleHeading(cycle, index),
    `Outcome: ${cycle.cycleOutcome}`,
    listSection("Explanation:", cycle.explanation),
    section(
      "Checks for understanding:",
      cycle.checksForUnderstanding.length === 0
        ? undefined
        : cycle.checksForUnderstanding.map(renderCheck).join("\n"),
    ),
    listSection("Practice task:", cycle.practiceTask),
    listSection("Feedback on the practice task:", cycle.feedback),
  ].filter((part) => part !== undefined);

  return parts.join("\n\n");
}

export function renderLearningCycleTitles(summary: TranscriptSummary): string {
  return summary.learningCycles.length === 0
    ? "No learning cycles were reconstructed from the lesson transcript."
    : bulletList(summary.learningCycles.map(cycleHeading));
}

export function renderPracticeTasksWithFeedback(summary: TranscriptSummary): string {
  const cycles = summary.learningCycles
    .map((cycle, index) => {
      const parts = [
        cycleHeading(cycle, index),
        listSection("Practice task:", cycle.practiceTask),
        listSection("Feedback on the practice task:", cycle.feedback),
      ].filter((part) => part !== undefined);

      return parts.length === 1 ? undefined : parts.join("\n\n");
    })
    .filter((cycle) => cycle !== undefined);

  return cycles.length === 0
    ? "No practice tasks or feedback were reconstructed from the lesson transcript."
    : cycles.join("\n\n");
}

export function renderChecksForUnderstanding(summary: TranscriptSummary): string {
  const cycles = summary.learningCycles
    .map((cycle, index) =>
      cycle.checksForUnderstanding.length === 0
        ? undefined
        : [
            cycleHeading(cycle, index),
            section(
              "Checks for understanding:",
              cycle.checksForUnderstanding.map(renderCheck).join("\n"),
            ),
          ].join("\n\n"),
    )
    .filter((cycle) => cycle !== undefined);

  return cycles.length === 0
    ? "No checks for understanding were reconstructed from the lesson transcript."
    : cycles.join("\n\n");
}

export function renderTranscriptSummary(summary: TranscriptSummary): string {
  const cycles =
    summary.learningCycles.length === 0
      ? undefined
      : [
          "Learning cycles reconstructed from the lesson transcript, in the order they were taught:",
          ...summary.learningCycles.map((cycle, index) => renderCycle(cycle, index)),
        ].join("\n\n");

  const sections = [
    cycles,
    listSection(
      "Teaching from the transcript that belongs to no single cycle:",
      summary.unassignedTranscriptContent,
    ),
  ].filter((part) => part !== undefined);

  return sections.join("\n\n");
}
