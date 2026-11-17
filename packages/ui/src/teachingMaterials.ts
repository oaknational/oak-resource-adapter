import type { LessonContext } from "@oaknational/resource-adapter-contracts";

/**
 * In the order the menu lists them. `analyticsType` matches the values of the
 * Avo tracking plan's `Teaching Material Type`.
 */
const TEACHING_MATERIALS = [
  { id: "additional-glossary", label: "Glossary", analyticsType: "glossary" },
  {
    id: "additional-comprehension",
    label: "Comprehension task",
    analyticsType: "comprehension task",
  },
  {
    id: "additional-starter-quiz",
    label: "More starter quiz questions",
    analyticsType: "starter quiz",
  },
  {
    id: "additional-exit-quiz",
    label: "More exit quiz questions",
    analyticsType: "exit quiz",
  },
] as const;

export type TeachingMaterial = (typeof TEACHING_MATERIALS)[number];
export type ResourceAdapterTeachingMaterialId = TeachingMaterial["id"];

const LABS_TEACHING_MATERIALS_URL =
  "https://labs.thenational.academy/aila/teaching-materials";

export function teachingMaterialsFor(
  ids: readonly string[],
): readonly TeachingMaterial[] {
  return TEACHING_MATERIALS.filter(({ id }) => ids.includes(id));
}

export function getSupportedTeachingMaterialIds(
  ids: readonly string[],
): readonly ResourceAdapterTeachingMaterialId[] {
  return teachingMaterialsFor(ids).map(({ id }) => id);
}

export function teachingMaterialHref(
  { lessonSlug, programmeSlug }: Pick<LessonContext, "lessonSlug" | "programmeSlug">,
  id: ResourceAdapterTeachingMaterialId,
): string {
  const query = new URLSearchParams({ lessonSlug, programmeSlug, docType: id });
  return `${LABS_TEACHING_MATERIALS_URL}?${query.toString()}`;
}
