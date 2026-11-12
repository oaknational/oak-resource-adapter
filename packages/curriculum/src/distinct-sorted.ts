export function distinctSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].toSorted((a, b) => a.localeCompare(b));
}
