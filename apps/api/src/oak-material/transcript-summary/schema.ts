import { z } from "zod";

const statementSchema = z.string().trim().min(1).max(400);
const statementsSchema = z.array(statementSchema).max(20);

// This is a current Oak standard for the maximum number of learning cycles.
const maximumLearningCycles = 3;

export const transcriptSummarySchema = z
  .object({
    learningCycles: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(50),
          cycleOutcome: z.string().trim().min(1).max(200),
          explanation: statementsSchema,
          checksForUnderstanding: z
            .array(
              z.object({
                question: z.string().trim().min(1).max(300),
                expectedAnswer: statementSchema.nullable(),
                teacherResponse: statementSchema.nullable(),
              }),
            )
            .max(12),
          practiceTask: statementsSchema.nullable(),
          feedback: statementsSchema.nullable(),
        }),
      )
      .max(maximumLearningCycles),
    unassignedTranscriptContent: statementsSchema,
  })
  .refine(
    ({ learningCycles, unassignedTranscriptContent }) =>
      learningCycles.length > 0 || unassignedTranscriptContent.length > 0,
    { message: "A transcript summary must contain teaching content." },
  );

export type TranscriptSummary = z.infer<typeof transcriptSummarySchema>;
