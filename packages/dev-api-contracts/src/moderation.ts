import { z } from "zod";

// A fixed set of committed inputs, never free text: dev routes are open on Preview and staging.
export const moderationSmokeRequestSchema = z.strictObject({
  case: z.enum(["expected-pass", "expected-flag"]),
});

export type ModerationSmokeRequest = z.input<typeof moderationSmokeRequestSchema>;

export type ModerationSmokeCase = ModerationSmokeRequest["case"];

export const moderationSmokeResponseSchema = z
  .object({
    flaggedCategories: z.array(z.string()).readonly(),
    outcome: z.enum(["FAILED", "FLAGGED", "PASSED"]),
    promptVersion: z.string().nullable(),
    reason: z.string().nullable(),
    unrecognisedCategories: z.array(z.string()).readonly(),
  })
  .readonly();

export type ModerationSmokeResponse = z.infer<typeof moderationSmokeResponseSchema>;
