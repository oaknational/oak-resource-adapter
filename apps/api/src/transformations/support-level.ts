import type { SupportLevel } from "@oaknational/resource-adapter-contracts/internal";

export type { SupportLevel } from "@oaknational/resource-adapter-contracts/internal";

export type SupportLevelOption = Readonly<{
  description: string;
  label: string;
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
