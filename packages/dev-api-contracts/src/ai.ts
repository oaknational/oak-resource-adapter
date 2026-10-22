import { z } from "zod";

export const modelInvocationRequestSchema = z.strictObject({
  input: z.string().min(1).max(2000),
});

export type ModelInvocationRequest = z.input<typeof modelInvocationRequestSchema>;

export const modelInvocationResponseSchema = z
  .object({
    outcome: z.enum(["INCOMPLETE", "OUTPUT_MISSING", "REFUSAL", "SUCCESS"]),
    outputText: z.string().nullable(),
    providerResponseId: z.string().nullable(),
    usage: z
      .object({
        inputTokens: z.number(),
        outputTokens: z.number(),
        totalTokens: z.number(),
      })
      .readonly()
      .nullable(),
  })
  .readonly();

export type ModelInvocationResponse = z.infer<typeof modelInvocationResponseSchema>;
