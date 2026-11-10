import { defineRule, type RuleMetadata } from "../../rules/rule";
import type { TransformationRuleContext } from "../types";

/** Reads the key stage the resource document records, not the lesson's programme. */
export function keyStageRule<const TId extends string>(
  metadata: RuleMetadata<TId>,
  config: Readonly<{ keyStageSlugs: readonly string[] }>,
) {
  return defineRule({
    ...metadata,
    kind: "key-stage",
    config,
    displayValues: config.keyStageSlugs.map((slug) => slug.toUpperCase()),
    reads: ["resource"],
    check: ({
      document: { metadata },
    }: Pick<TransformationRuleContext, "document">) => {
      const keyStage =
        "keyStage" in metadata ? metadata.keyStage?.id.toLowerCase() : undefined;
      return keyStage !== undefined && config.keyStageSlugs.includes(keyStage)
        ? null
        : "unsupported-key-stage";
    },
  });
}
