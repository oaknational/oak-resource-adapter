import type { ParserState } from "./types.js";

/**
 * Reserved, so a generated ID cannot collide with extraction's own and cannot
 * be mistaken for something safe to store as a reference: it is derived from
 * position and content, so surrounding edits change it.
 */
const UNSTABLE_ID_PREFIX = "unstable:";

export function nextGeneratedId(state: ParserState, seed: string): string {
  const slug = seed
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "")
    .slice(0, 64);
  const base = slug.length > 0 ? slug : "content";
  const count = (state.generatedIds.get(base) ?? 0) + 1;
  state.generatedIds.set(base, count);
  const slugWithOrdinal = count === 1 ? base : `${base}-${count}`;
  return `${UNSTABLE_ID_PREFIX}${slugWithOrdinal}`;
}
