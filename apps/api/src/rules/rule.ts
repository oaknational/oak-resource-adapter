import type { RuleConfig } from "@oaknational/resource-adapter-dev-api-contracts";

export type RuleLevel = "lesson" | "capability" | "transformation";

/**
 * Rules are built by their kind's factory, so `check` reads `config` rather than
 * values of its own, and what the dev API shows is what the rule checks.
 */
export type Rule<
  TContext,
  TKind extends string = string,
  TId extends string = string,
  TReason extends string = string,
  TConfig extends RuleConfig = RuleConfig,
> = Readonly<{
  id: TId;
  kind: TKind;
  description: string;
  config: TConfig;
  check: (context: TContext) => TReason | null;
}>;

export type RuleMetadata<TId extends string> = Readonly<{
  id: TId;
  description: string;
}>;

export function defineRule<
  TContext,
  const TKind extends string,
  const TId extends string,
  const TReason extends string,
  const TConfig extends RuleConfig,
>(
  rule: Rule<TContext, TKind, TId, TReason, TConfig>,
): Rule<TContext, TKind, TId, TReason, TConfig> {
  return rule;
}

export type RuleRefusal<TLevel extends RuleLevel, TRule> = TRule extends {
  id: infer TId;
  check: (context: never) => infer TReason | null;
}
  ? Readonly<{ level: TLevel; rule: TId; reason: TReason }>
  : never;

export function firstRefusal<
  TLevel extends RuleLevel,
  TContext,
  const TRules extends readonly Rule<TContext>[],
>(
  level: TLevel,
  rules: TRules,
  context: TContext,
): RuleRefusal<TLevel, TRules[number]> | null {
  for (const rule of rules) {
    const reason = rule.check(context);
    if (reason !== null) {
      return { level, rule: rule.id, reason } as RuleRefusal<TLevel, TRules[number]>;
    }
  }
  return null;
}
