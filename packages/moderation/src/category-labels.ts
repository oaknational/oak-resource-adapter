import { isModerationCategory, type ModerationCategory } from "./categories.js";

// Placeholder copy from Aila's moderationCategoriesOakService.json until design
// signs off the wording.
const categoryLabels: Readonly<Record<ModerationCategory, string>> = {
  "l/discriminatory-language": "Discriminatory behaviour or language",
  "l/offensive-language": "Language may offend",
  "u/sensitive-content": "Sensitive or upsetting content",
  "u/violence-or-suffering": "Violence or suffering",
  "u/mental-health-challenges": "Mental health challenges",
  "u/crime-or-illegal-activities": "Crime or illegal activities",
  "u/sexual-violence": "Sexual violence",
  "s/nudity-or-sexual-content": "Nudity or sexual content",
  "p/practical-activities": "Practical equipment and activities",
  "p/outdoor-learning": "Outdoor learning",
  "p/additional-qualifications": "Additional qualifications required",
  "r/recent-content": "Recent content",
  "r/recent-conflicts": "Recent conflicts (ended)",
  "n/self-harm-suicide": "Self-harm and suicide",
  "n/potentially-offensive-language": "Offensive language",
  "n/strangulation-suffocation": "Strangulation and suffocation",
  "t/guides-self-harm-suicide": "Guides self-harm or suicide",
  "t/encourages-harmful-behaviour": "Encourages harmful behaviour",
  "t/encourages-illegal-activity": "Encourages illegal activity",
  "t/encourages-violence-harm-others": "Encourages violence or harm to others",
  "t/using-creating-weapons": "Using or creating weapons",
  "t/using-creating-harmful-substances": "Using or creating harmful substances",
  "t/extreme-offensive-language": "Extreme offensive or abusive language",
  "e/rshe-content": "RSHE content",
};

const groupLabels: Readonly<Record<string, string>> = {
  e: "RSHE",
  l: "Language and discrimination",
  n: "Nuanced content requiring care",
  p: "Physical activity and equipment requiring safe use",
  r: "Recent and time-sensitive content",
  s: "Nudity and sex",
  t: "Toxic",
  u: "Upsetting, disturbing and sensitive",
};

export const OTHER_CONTENT_GUIDANCE_LABEL = "Other content guidance";

/** A plain-language name for a flagged code, falling back to its group for a code added upstream. */
export function moderationCategoryLabel(code: string): string {
  if (isModerationCategory(code)) {
    return categoryLabels[code];
  }
  const [prefix] = code.split("/");
  return (
    (prefix === undefined ? undefined : groupLabels[prefix]) ??
    OTHER_CONTENT_GUIDANCE_LABEL
  );
}
