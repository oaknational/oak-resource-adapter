import { buildLesson } from "@oaknational/resource-adapter-curriculum";
import { describe, expect, it, vi } from "vitest";

import type { ResourceAdapterModelInvoker } from "@/ai/model-roles";
import { readOakMaterial, renderOakMaterial } from "../requirements";
import { createTranscriptSummariser } from "./invoke";
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
