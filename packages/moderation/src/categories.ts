export const MODERATION_CATEGORIES = [
  "l/discriminatory-language",
  "l/offensive-language",
  "u/sensitive-content",
  "u/violence-or-suffering",
  "u/mental-health-challenges",
  "u/crime-or-illegal-activities",
  "u/sexual-violence",
  "s/nudity-or-sexual-content",
  "p/practical-activities",
  "p/outdoor-learning",
  "p/additional-qualifications",
  "r/recent-content",
  "r/recent-conflicts",
  "n/self-harm-suicide",
  "n/potentially-offensive-language",
  "n/strangulation-suffocation",
  "t/guides-self-harm-suicide",
  "t/encourages-harmful-behaviour",
  "t/encourages-illegal-activity",
  "t/encourages-violence-harm-others",
  "t/using-creating-weapons",
  "t/using-creating-harmful-substances",
  "t/extreme-offensive-language",
  "e/rshe-content",
] as const;

export type ModerationCategory = (typeof MODERATION_CATEGORIES)[number];

/** 5 means the content is not involved in the category, 1 means it is heavily involved. */
export type ModerationScore = 1 | 2 | 3 | 4 | 5;

export type ModerationScores = Readonly<Record<ModerationCategory, ModerationScore>>;

const knownCategories: ReadonlySet<string> = new Set(MODERATION_CATEGORIES);

export function isModerationCategory(code: string): code is ModerationCategory {
  return knownCategories.has(code);
}
