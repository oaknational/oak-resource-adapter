import { buildLesson } from "@oaknational/resource-adapter-curriculum";
import { describe, expect, it, vi } from "vitest";

import type { ResourceAdapterModelInvoker } from "@/ai/model-roles";
import { readOakMaterial, renderOakMaterial } from "../requirements";
import { createTranscriptSummariser } from "./invoke";
import {
  renderChecksForUnderstanding,
  renderLearningCycleTitles,
  renderPracticeTasksWithFeedback,
  renderTranscriptSummary,
} from "./render";
import { transcriptSummarySchema } from "./schema";

const requirement = [{ key: "lesson.transcriptSummary" as const, required: false }];

function invokerReturning(result: unknown): ResourceAdapterModelInvoker {
  return {
    invokeStructured: vi.fn(() => Promise.resolve(result)),
  } as unknown as ResourceAdapterModelInvoker;
}

describe("transcript summaries", () => {
  it("rejects a summary with no teaching content", () => {
    expect(
      transcriptSummarySchema.safeParse({
        learningCycles: [],
        unassignedTranscriptContent: [],
      }).success,
    ).toBe(false);
  });

  it("renders teaching that has no recoverable learning cycles", () => {
    const summary = transcriptSummarySchema.parse({
      learningCycles: [],
      unassignedTranscriptContent: [
        "The teacher compares first- and third-person accounts of the same event.",
      ],
    });

    expect(renderTranscriptSummary(summary)).toBe(
      "Teaching from the transcript that belongs to no single cycle:\n" +
        "- The teacher compares first- and third-person accounts of the same event.",
    );
  });

  it("renders only the learning cycle titles", () => {
    const summary = transcriptSummarySchema.parse({
      learningCycles: [
        {
          sequence: 1,
          title: "Identify equivalent fractions",
          cycleOutcome: "Recognise equivalent fractions",
          explanation: ["Equivalent fractions have the same value."],
          checksForUnderstanding: [],
          practiceTask: null,
          feedback: null,
        },
        {
          sequence: 2,
          title: "Add fractions",
          cycleOutcome: "Add fractions with a common denominator",
          explanation: ["Add the numerators and keep the denominator."],
          checksForUnderstanding: [],
          practiceTask: null,
          feedback: null,
        },
      ],
      unassignedTranscriptContent: [],
    });

    expect(renderLearningCycleTitles(summary)).toBe(
      "- Cycle 1: Identify equivalent fractions\n- Cycle 2: Add fractions",
    );
  });

  it("renders only practice tasks with their feedback", () => {
    const summary = transcriptSummarySchema.parse({
      learningCycles: [
        {
          sequence: 1,
          title: "Identify equivalent fractions",
          cycleOutcome: "Recognise equivalent fractions",
          explanation: ["Equivalent fractions have the same value."],
          checksForUnderstanding: [],
          practiceTask: ["Find two fractions equivalent to one half."],
          feedback: ["Multiply the numerator and denominator by the same number."],
        },
      ],
      unassignedTranscriptContent: ["A fraction describes part of a whole."],
    });

    expect(renderPracticeTasksWithFeedback(summary)).toBe(
      "Cycle 1: Identify equivalent fractions\n\n" +
        "Practice task:\n- Find two fractions equivalent to one half.\n\n" +
        "Feedback on the practice task:\n" +
        "- Multiply the numerator and denominator by the same number.",
    );
  });

  it("renders only checks for understanding", () => {
    const summary = transcriptSummarySchema.parse({
      learningCycles: [
        {
          sequence: 1,
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
          practiceTask: ["Find two fractions equivalent to one half."],
          feedback: null,
        },
      ],
      unassignedTranscriptContent: [],
    });

    expect(renderChecksForUnderstanding(summary)).toBe(
      "Cycle 1: Identify equivalent fractions\n\n" +
        "Checks for understanding:\n" +
        "- Are one half and two quarters equivalent?\n" +
        "  - Expected answer: Yes.\n" +
        "  - Teacher's response: Both fractions describe the same amount.",
    );
  });

  it.each([
    {
      expected: "Practice task:\n- Find two equivalent fractions.",
      key: "lesson.transcriptSummary.practiceTasksWithFeedback" as const,
    },
    {
      expected: "Checks for understanding:\n- What makes fractions equivalent?",
      key: "lesson.transcriptSummary.checksForUnderstanding" as const,
    },
  ])("renders the $key material view", async ({ expected, key }) => {
    const requirements = [{ key, required: false }];
    const { material } = await readOakMaterial(
      requirements,
      buildLesson({ transcript: "The teacher explains equivalent fractions." }),
      {
        summariseTranscript: async () => ({
          learningCycles: [
            {
              sequence: 1,
              title: "Equivalent fractions",
              cycleOutcome: "Recognise equivalent fractions",
              explanation: ["Equivalent fractions have the same value."],
              checksForUnderstanding: [
                {
                  question: "What makes fractions equivalent?",
                  expectedAnswer: null,
                  teacherResponse: null,
                },
              ],
              practiceTask: ["Find two equivalent fractions."],
              feedback: ["Scale both parts by the same factor."],
            },
          ],
          unassignedTranscriptContent: [],
        }),
      },
    );

    const rendered = renderOakMaterial(requirements, material);

    expect(rendered).toContain(expected);
    expect(rendered).not.toContain("Equivalent fractions have the same value.");
  });

  it("does not invoke the summariser when the lesson has no transcript", async () => {
    const summariseTranscript = vi.fn();

    const resolution = await readOakMaterial(
      requirement,
      buildLesson({ transcript: null }),
      { summariseTranscript },
    );

    expect(summariseTranscript).not.toHaveBeenCalled();
    expect(resolution.material).toEqual({});
    expect(resolution.warnings.join(" ")).toContain("the lesson has no transcript");
  });

  it.each([
    {
      name: "a refusal",
      result: {
        meta: { invocationId: "11111111-1111-1111-1111-111111111111" },
        outcome: "REFUSAL",
        refusal: "Cannot comply.",
      },
    },
    {
      name: "a schema mismatch",
      result: {
        issues: [],
        meta: { invocationId: "11111111-1111-1111-1111-111111111111" },
        outcome: "STRUCTURED_OUTPUT_FAILURE",
        reason: "SCHEMA_MISMATCH",
      },
    },
  ])("degrades $name to a warning", async ({ result }) => {
    const summariseTranscript = createTranscriptSummariser(invokerReturning(result));

    const resolution = await readOakMaterial(
      requirement,
      buildLesson({ transcript: "The teacher explains perspective." }),
      { summariseTranscript },
    );

    expect(resolution.material).toEqual({});
    expect(resolution.warnings.join(" ")).toContain(
      "the summariser returned nothing usable",
    );
  });
});
