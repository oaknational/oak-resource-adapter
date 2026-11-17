import type { TeachingMaterialsCatalogue } from "@oaknational/resource-adapter-dev-api-contracts";

type Selection = TeachingMaterialsCatalogue["selections"][number];

function stringsIn(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** A selection does nothing while a lesson rule refuses every subject it lists. */
export function selectionNote(
  { rule }: Selection,
  lessonRules: TeachingMaterialsCatalogue["lesson"],
): string | undefined {
  const excluded = new Set(
    lessonRules
      .filter(({ kind }) => kind === "subject")
      .flatMap(({ config }) => stringsIn(config.subjectSlugs)),
  );
  const slugs = stringsIn(rule.config.subjectSlugs);
  return slugs.length > 0 && slugs.every((slug) => excluded.has(slug))
    ? "No effect yet: these subjects get no labs links at all."
    : undefined;
}
