import type { OakMaterialKey } from "../../oak-material/material";
import { OAK_MATERIAL, oakMaterialIsAvailable } from "../../oak-material/catalogue";
import { defineRule, type RuleMetadata } from "../../rules/rule";

/** Material with no source cannot be read for any lesson, so the kind could never run. */
export function materialSourceRule<const TId extends string>(
  metadata: RuleMetadata<TId>,
  config: Readonly<{ requiredKeys: readonly OakMaterialKey[] }>,
) {
  return defineRule({
    ...metadata,
    kind: "material-source",
    config,
    displayValuesLabel: "Needs",
    displayValues: config.requiredKeys.map((key) => OAK_MATERIAL[key].label),
    reads: [],
    check: () =>
      config.requiredKeys.some((key) => !oakMaterialIsAvailable(key))
        ? "no-material-source"
        : null,
  });
}
