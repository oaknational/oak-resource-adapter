export type RuleConfigValue =
  | boolean
  | number
  | string
  | null
  | readonly RuleConfigValue[]
  | Readonly<{ [key: string]: RuleConfigValue }>;

/** A rule's config as the dev API returns it, so it must be plain JSON. */
export type RuleConfig = Readonly<Record<string, RuleConfigValue>>;
