import { z } from "zod";

export const targetSchema = z.discriminatedUnion("scope", [
  z.strictObject({ scope: z.literal("document") }),
  z.strictObject({
    nodeTypes: z.array(z.string()).min(1),
    scope: z.literal("node"),
  }),
]);

export const transformationInputSchema = z.strictObject({
  id: z.string(),
  kind: z.literal("choice"),
  label: z.string(),
  options: z.array(
    z.strictObject({
      description: z.string(),
      label: z.string(),
      value: z.string(),
    }),
  ),
});

export const suggestionGuidanceSchema = z.strictObject({
  avoidWhen: z.string(),
  description: z.string(),
  useWhen: z.string(),
});

export const transformationOutputsSchema = z
  .array(z.enum(["companion-document", "revised-resource"]))
  .min(1);
