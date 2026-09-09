import { describe, expect, it } from "vitest";

import {
  renderChecksForUnderstanding,
  renderLearningCycleTitles,
  renderPracticeTasksWithFeedback,
  renderTranscriptSummary,
} from "./render";
import { transcriptSummarySchema } from "./schema";

const summary = transcriptSummarySchema.parse({
  learningCycles: [
    {
      title: "Identify fractions",
      cycleOutcome: "Identify a fraction of a whole",
      explanation: ["A fraction describes part of a whole."],
      checksForUnderstanding: [],
      practiceTask: ["Shade one half of a rectangle."],
      feedback: ["The two parts must be equal."],
    },
    {
      title: "Identify equivalent fractions",
      cycleOutcome: "Recognise equivalent fractions",
      explanation: ["Equivalent fractions have the same value."],
      checksForUnderstanding: [
        {
          question: "Are one half and two quarters equivalent?",
          expectedAnswer: "Yes.",
          teacherResponse: "Both fractions describe the same amount.",
        },
      ],
      practiceTask: null,
      feedback: null,
    },
  ],
  unassignedTranscriptContent: ["The lesson begins with a recap of equal parts."],
});

describe("transcript summary renderers", () => {
  it("renders outcomes, explanations, and unassigned content", () => {
    const transcriptSummary = transcriptSummarySchema.parse({
      learningCycles: [
        {
          title: "Identify fractions",
          cycleOutcome: "Identify a fraction of a whole",
          explanation: ["A fraction describes part of a whole."],
          checksForUnderstanding: [],
          practiceTask: null,
          feedback: null,
        },
      ],
      unassignedTranscriptContent: ["The lesson begins with a recap of equal parts."],
    });

    expect(renderTranscriptSummary(transcriptSummary)).toBe(
      "Learning cycles reconstructed from the lesson transcript, in the order they were taught:\n\n" +
        "Cycle 1: Identify fractions\n\n" +
        "Outcome: Identify a fraction of a whole\n\n" +
        "Explanation:\n- A fraction describes part of a whole.\n\n" +
        "Teaching from the transcript that belongs to no single cycle:\n" +
        "- The lesson begins with a recap of equal parts.",
    );
  });

  it("renders learning cycle titles", () => {
    expect(renderLearningCycleTitles(summary)).toBe(
      "- Cycle 1: Identify fractions\n" + "- Cycle 2: Identify equivalent fractions",
    );
  });

  it("renders practice tasks with feedback", () => {
    expect(renderPracticeTasksWithFeedback(summary)).toBe(
      "Cycle 1: Identify fractions\n\n" +
        "Practice task:\n- Shade one half of a rectangle.\n\n" +
        "Feedback on the practice task:\n- The two parts must be equal.",
    );
  });

  it("renders checks for understanding with their original cycle number", () => {
    expect(renderChecksForUnderstanding(summary)).toBe(
      "Cycle 2: Identify equivalent fractions\n\n" +
        "Checks for understanding:\n" +
        "- Are one half and two quarters equivalent?\n" +
        "  - Expected answer: Yes.\n" +
        "  - Teacher's response: Both fractions describe the same amount.",
    );
  });

  it("renders empty states", () => {
    const summaryWithoutCycles = transcriptSummarySchema.parse({
      learningCycles: [],
      unassignedTranscriptContent: ["The teacher recaps equal parts."],
    });

    expect(renderLearningCycleTitles(summaryWithoutCycles)).toBe(
      "No learning cycles were reconstructed from the lesson transcript.",
    );
    expect(renderPracticeTasksWithFeedback(summaryWithoutCycles)).toBe(
      "No practice tasks or feedback were reconstructed from the lesson transcript.",
    );
    expect(renderChecksForUnderstanding(summaryWithoutCycles)).toBe(
      "No checks for understanding were reconstructed from the lesson transcript.",
    );
  });
});
