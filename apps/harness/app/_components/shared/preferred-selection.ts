/**
 * A URL-requested selection wins when the catalogue offers it, then whatever is
 * already chosen, then the first entry.
 */
export function preferredSelection(
  requested: string | undefined,
  current: string,
  availableIds: readonly string[],
): string {
  if (requested !== undefined && availableIds.includes(requested)) {
    return requested;
  }

  return availableIds.includes(current) ? current : (availableIds[0] ?? "");
}
