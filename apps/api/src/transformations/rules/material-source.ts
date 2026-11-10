import type { OakMaterialKey } from "../../oak-material/material";
import { oakMaterialIsAvailable } from "../../oak-material/catalogue";
import { defineRule, type RuleMetadata } from "../../rules/rule";

/** Material with no source cannot be read for any lesson, so the kind could never run. */
export function materialSourceRule<const TId extends string>(
  { id, description }: RuleMetadata<TId>,
  config: Readonly<{ requiredKeys: readonly OakMaterialKey[] }>,
) {
  return defineRule({
    id,
    kind: "material-source",
    description,
    config,
    check: () =>
      config.requiredKeys.some((key) => !oakMaterialIsAvailable(key))
        ? "no-material-source"
        : null,
  });
}
