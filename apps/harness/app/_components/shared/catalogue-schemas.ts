import { z } from "zod";

export const targetSchema = z.discriminatedUnion("scope", [
  z.strictObject({ scope: z.literal("document") }),
  z.strictObject({
    nodeTypes: z.array(z.string()).min(1),
    scope: z.literal("node"),
  }),
]);

export const supportLevelSchema = z.strictObject({
  description: z.string(),
  level: z.enum(["low", "mid", "high"]),
});

export const suggestionGuidanceSchema = z.strictObject({
  avoidWhen: z.string(),
  description: z.string(),
  useWhen: z.string(),
});

export const transformationOutputsSchema = z
  .array(z.enum(["companion-document", "revised-resource"]))
  .min(1);
