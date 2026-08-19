import type {
  OakMaterialSummary,
  TransformationCatalogueItem,
} from "./transformation-api";

export type OakMaterialUsage = Readonly<{
  part: OakMaterialSummary;
  /** The transformations declaring this part, with whether each requires it. */
  usedBy: ReadonlyArray<Readonly<{ label: string; required: boolean }>>;
}>;

/** Inverts the catalogue: each part, and which transformations ask for it. */
export function oakMaterialUsage(
  material: readonly OakMaterialSummary[],
  transformations: readonly TransformationCatalogueItem[],
): readonly OakMaterialUsage[] {
  return material.map((part) => ({
    part,
    usedBy: transformations.flatMap((transformation) =>
      transformation.materialRequirements
        .filter(({ key }) => key === part.key)
        .map(({ required }) => ({ label: transformation.label, required })),
    ),
  }));
}
