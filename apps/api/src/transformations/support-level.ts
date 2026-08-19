/**
 * How much support a scaffold gives, on one scale shared by every transformation so a
 * teacher can compare across them.
 */
export const SUPPORT_LEVELS = ["low", "mid", "high"] as const;

export type SupportLevel = (typeof SUPPORT_LEVELS)[number];

/**
 * One level a transformation offers. The description is teacher-facing;
 * "mid" alone tells a teacher nothing.
 */
export type SupportLevelOption = Readonly<{
  description: string;
  level: SupportLevel;
}>;

export type SupportLevelOptions = readonly [
  SupportLevelOption,
  ...SupportLevelOption[],
];

export function supportLevelsOf(
  options: SupportLevelOptions,
): readonly [SupportLevel, ...SupportLevel[]] {
  const [first, ...rest] = options;
  return [first.level, ...rest.map(({ level }) => level)];
}
