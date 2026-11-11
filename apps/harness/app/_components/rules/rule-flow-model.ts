import type {
  RuleCatalogue,
  RuleDescription,
} from "@oaknational/resource-adapter-dev-api-contracts";

type CatalogueTransformation = RuleCatalogue["transformations"][number];
type TransformationInputs = CatalogueTransformation["inputs"];

export function ruleAnchor(scope: string, ruleId: string): string {
  return `rule-${scope}-${ruleId}`.replaceAll(/[^a-zA-Z0-9-]/g, "-");
}

/** `removed` names the support levels a narrowing rule takes away. */
export type RuleOutcome = Readonly<{ narrows: boolean; removed: readonly string[] }>;

export function ruleOutcome(
  { removesSupportLevels }: Pick<RuleDescription, "removesSupportLevels">,
  inputs: TransformationInputs = [],
): RuleOutcome {
  if (removesSupportLevels === undefined) {
    return { narrows: false, removed: [] };
  }
  const options = inputs.flatMap((input) => input.options);
  const remains = options.some(({ value }) => !removesSupportLevels.includes(value));
  return remains
    ? {
        narrows: true,
        removed: options
          .filter(({ value }) => removesSupportLevels.includes(value))
          .map(({ label }) => label),
      }
    : { narrows: false, removed: [] };
}

export type FlowRow = Readonly<{
  anchor: string;
  /** Set only where the rule's outcome differs from the rest of its box. */
  outcome?: RuleOutcome;
  /** Why a rule currently has no effect, when another rule already covers it. */
  note?: string | undefined;
  /** Shared by every scaffold, but each sets it differently. */
  variesByScaffold?: boolean;
  rule: RuleDescription;
}>;

export type ScaffoldSetting = Readonly<{ label: string; values: readonly string[] }>;

export const LESSON_SCOPE = "lesson";

const EVERY_SCAFFOLD_SCOPE = "every-scaffold";

export function capabilityScope(id: string): string {
  return `capability-${id}`;
}

export function transformationScope(kind: string): string {
  return `transformation-${kind}`;
}

export type RuleFlowModel = Readonly<{
  lesson: readonly FlowRow[];
  capabilities: readonly Readonly<{
    id: string;
    label: string;
    rules: readonly FlowRow[];
  }>[];
  /** Rules every offered scaffold is checked against. */
  commonScaffoldRules: readonly FlowRow[];
  scaffolds: readonly Readonly<{
    kind: string;
    label: string;
    /** How this scaffold sets the shared rules that vary between scaffolds. */
    settings: readonly ScaffoldSetting[];
    rules: readonly FlowRow[];
  }>[];
  notOfferedScaffolds: readonly Readonly<
    Pick<CatalogueTransformation, "kind" | "label" | "status"> & {
      rules: readonly FlowRow[];
    }
  >[];
}>;

function commonRules(
  transformations: readonly CatalogueTransformation[],
): readonly RuleDescription[] {
  const [first, ...rest] = transformations;
  if (first === undefined) {
    return [];
  }
  return first.rules.filter(({ id }) =>
    rest.every(({ rules }) => rules.some((rule) => rule.id === id)),
  );
}

function configsDiffer(
  transformations: readonly CatalogueTransformation[],
  ruleId: string,
): boolean {
  const configs = new Set(
    transformations.map(({ rules }) =>
      JSON.stringify(rules.find(({ id }) => id === ruleId)?.config),
    ),
  );
  return configs.size > 1;
}

function subjectSlugsOf({ config, kind }: RuleDescription): readonly string[] {
  const slugs = config.subjectSlugs;
  return kind === "subject" && Array.isArray(slugs)
    ? slugs.filter((slug): slug is string => typeof slug === "string")
    : [];
}

/** A subject rule below the lesson level does nothing while the lesson rule excludes every subject it lists. */
function supersededNote(
  rule: RuleDescription,
  lessonSubjects: ReadonlySet<string>,
): string | undefined {
  const slugs = subjectSlugsOf(rule);
  return slugs.length > 0 && slugs.every((slug) => lessonSubjects.has(slug))
    ? "No effect yet: these subjects are excluded from ORA at the lesson level."
    : undefined;
}

function ownRules(
  { inputs, kind, rules }: CatalogueTransformation,
  commonIds: ReadonlySet<string>,
  lessonSubjects: ReadonlySet<string>,
): FlowRow[] {
  return rules
    .filter(({ id }) => !commonIds.has(id))
    .map((rule) => ({
      anchor: ruleAnchor(transformationScope(kind), rule.id),
      note: supersededNote(rule, lessonSubjects),
      outcome: ruleOutcome(rule, inputs),
      rule,
    }));
}

export function buildRuleFlow(catalogue: RuleCatalogue): RuleFlowModel {
  const offered = catalogue.transformations.filter(
    ({ capabilityIds, status }) => status === "active" && capabilityIds.length > 0,
  );
  const common = commonRules(offered);
  const commonIds = new Set(common.map(({ id }) => id));
  const varying = new Set(
    common.filter(({ id }) => configsDiffer(offered, id)).map(({ id }) => id),
  );
  const lessonSubjects = new Set(catalogue.lesson.flatMap(subjectSlugsOf));

  return {
    lesson: catalogue.lesson.map((rule) => ({
      anchor: ruleAnchor(LESSON_SCOPE, rule.id),
      rule,
    })),
    capabilities: catalogue.capabilities.map(({ id, label, rules }) => ({
      id,
      label,
      rules: rules.map((rule) => ({
        anchor: ruleAnchor(capabilityScope(id), rule.id),
        note: supersededNote(rule, lessonSubjects),
        rule,
      })),
    })),
    commonScaffoldRules: common.map((rule) => ({
      anchor: ruleAnchor(EVERY_SCAFFOLD_SCOPE, rule.id),
      rule,
      variesByScaffold: varying.has(rule.id),
    })),
    scaffolds: offered.map((transformation) => ({
      kind: transformation.kind,
      label: transformation.label,
      settings: transformation.rules
        .filter(({ id }) => varying.has(id))
        .flatMap(({ displayValues = [], displayValuesLabel, label: ruleLabel }) =>
          displayValues.length === 0
            ? []
            : [{ label: displayValuesLabel ?? ruleLabel, values: displayValues }],
        ),
      rules: ownRules(transformation, commonIds, lessonSubjects),
    })),
    notOfferedScaffolds: catalogue.transformations
      .filter((transformation) => !offered.includes(transformation))
      .map((transformation) => ({
        kind: transformation.kind,
        label: transformation.label,
        status: transformation.status,
        rules: ownRules(transformation, commonIds, lessonSubjects),
      })),
  };
}
