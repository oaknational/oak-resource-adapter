import { z } from "zod";

import { lessonIdentitySchema } from "./requests.js";

export const oakMaterialRequestSchema = z.strictObject({
  lesson: lessonIdentitySchema,
});

export type OakMaterialRequest = z.input<typeof oakMaterialRequestSchema>;

const oakMaterialPartSchema = z
  .object({
    key: z.string(),
    label: z.string(),
    text: z.string().nullable(),
    warning: z.string().nullable(),
  })
  .readonly();

export type OakMaterialPart = z.infer<typeof oakMaterialPartSchema>;

export const oakMaterialResponseSchema = z
  .object({ parts: z.array(oakMaterialPartSchema).readonly() })
  .readonly();

export type OakMaterialResponse = z.infer<typeof oakMaterialResponseSchema>;
