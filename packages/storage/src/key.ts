/** The first segment of every key, so one bucket can serve several environments. */
export type ArtifactEnvironment = "local" | "preview" | "staging" | "production";

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;

    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }

  return false;
}

/**
 * Builds the key an artifact is stored under.
 *
 * The result is the object's whole path, so it is also what belongs in
 * `resource_artifacts.storageKey` and what a later read addresses. Nothing
 * prepends to it again.
 *
 * @throws on a segment that is empty, padded, contains a slash, or carries a
 * character a bucket path cannot round-trip.
 */
export function artifactKey(
  environment: ArtifactEnvironment,
  segments: readonly string[],
): string {
  if (segments.length === 0) {
    throw new Error("An artifact key needs a segment after the environment.");
  }

  for (const segment of segments) {
    const description = JSON.stringify(segment);

    if (!segment || segment.trim() !== segment) {
      throw new Error(
        `An artifact key segment cannot be empty or padded: ${description}`,
      );
    }

    if (segment.includes("/")) {
      throw new Error(`An artifact key segment cannot contain "/": ${description}`);
    }

    if (hasControlCharacter(segment)) {
      throw new Error(
        `An artifact key segment cannot contain a control character: ${description}`,
      );
    }
  }

  return `${environment}/${segments.join("/")}`;
}
