import { z } from "zod";

import {
  isModerationCategory,
  type ModerationCategory,
  type ModerationScore,
  type ModerationScores,
} from "./categories.js";

const scoreSchema = z.literal([1, 2, 3, 4, 5]);

function knownScores(value: unknown): ModerationScores {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  const scores: Partial<Record<ModerationCategory, ModerationScore>> = {};
  for (const [category, score] of Object.entries(value)) {
    const parsed = scoreSchema.safeParse(score);
    if (isModerationCategory(category) && parsed.success) {
      scores[category] = parsed.data;
    }
  }
  return scores;
}

/**
 * Only `flagged_categories` decides an outcome, so it is the only field whose
 * absence makes a response unusable. A score the service adds, drops or puts
 * out of range is left out instead.
 */
export const moderationResponseSchema = z.object({
  flagged_categories: z.array(z.string()),
  scores: z.unknown().optional().transform(knownScores),
  prompt_version: z.string().optional().catch(undefined),
  moderation_id: z.string().optional().catch(undefined),
});
