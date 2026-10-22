import { z } from "zod";

import { MODERATION_CATEGORIES, type ModerationCategory } from "./categories.js";

const scoreSchema = z.literal([1, 2, 3, 4, 5]);

// Unknown score keys are stripped, so a category added upstream doesn't fail the parse.
const scoresSchema = z.object(
  Object.fromEntries(
    MODERATION_CATEGORIES.map((category) => [category, scoreSchema]),
  ) as Record<ModerationCategory, typeof scoreSchema>,
);

export const moderationResponseSchema = z.object({
  scores: scoresSchema,
  flagged_categories: z.array(z.string()),
  prompt_version: z.string(),
  moderation_id: z.string().optional(),
});
