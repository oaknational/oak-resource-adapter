import type {
  RuleCatalogue,
  RuleDescription,
} from "@oaknational/resource-adapter-dev-api-contracts";
import { describe, expect, it } from "vitest";

import { buildRuleFlow, ruleOutcome } from "./rule-flow-model";

const rule = (overrides: Partial<RuleDescription> = {}): RuleDescription => ({
  config: {},
  description: "A rule under test.",
  id: "test",
  kind: "test",
  label: "Test",
  reads: ["lesson"],
  condition: "The lesson is in one of these subjects",
  ...overrides,
});

const supportLevels = [
  {
    id: "supportLevel",
    kind: "choice" as const,
    label: "Support level",
    options: [
      { description: "Words.", label: "Add a word bank", value: "low" },
      {
        description: "Meanings.",
        label: "Add a word bank with definitions",
        value: "mid",
      },
    ],
  },
];

describe("ruleOutcome", () => {
  it("names the support levels a narrowing rule takes away", () => {
    expect(ruleOutcome(rule({ removesSupportLevels: ["mid"] }), supportLevels)).toEqual(
      {
        narrows: true,
        removed: ["Add a word bank with definitions"],
      },
    );
  });

  it("treats removing every level as not offered", () => {
    expect(
      ruleOutcome(rule({ removesSupportLevels: ["low", "mid"] }), supportLevels),
    ).toEqual({ narrows: false, removed: [] });
  });

  it("refuses for a rule that does not narrow", () => {
    expect(ruleOutcome(rule())).toEqual({ narrows: false, removed: [] });
  });
});

describe("buildRuleFlow", () => {
  const common = [rule({ id: "status" }), rule({ id: "target", reads: ["resource"] })];
  const catalogue: RuleCatalogue = {
    access: [],
    capabilities: [
      {
        id: "worksheetScaffolding",
        label: "Add extra scaffolding",
        rules: [rule({ id: "inputs" })],
      },
    ],
    gates: [],
    lesson: [
      rule({ id: "subject" }),
      rule({ id: "geo", reads: ["lesson", "teacher"] }),
    ],
    lessonMaterials: [],
    transformations: [
      {
        capabilityIds: ["worksheetScaffolding"],
        inputs: supportLevels,
        kind: "word-bank",
        label: "Add a word bank",
        rules: [...common, rule({ id: "mfl", removesSupportLevels: ["mid"] })],
        status: "active",
      },
      {
        capabilityIds: ["worksheetScaffolding"],
        kind: "glossary",
        label: "Add a glossary",
        rules: [...common],
        status: "active",
      },
      {
        capabilityIds: ["worksheetScaffolding"],
        kind: "chunking",
        label: "Chunk tasks",
        rules: [...common, rule({ id: "key-stage" })],
        status: "retired",
      },
      {
        capabilityIds: [],
        kind: "identity",
        label: "Leave unchanged",
        rules: [],
        status: "draft",
      },
    ],
  };
  const flow = buildRuleFlow(catalogue);

  it("shows the rules every offered scaffold shares once, before each scaffold's own", () => {
    expect(flow.commonScaffoldRules.map(({ rule: { id } }) => id)).toEqual([
      "status",
      "target",
    ]);
    expect(
      flow.scaffolds.map(({ kind, rules }) => [
        kind,
        rules.map(({ rule: { id } }) => id),
      ]),
    ).toEqual([
      ["word-bank", ["mfl"]],
      ["glossary", []],
    ]);
  });

  it("gives a scaffold's own rule its outcome, from its own support levels", () => {
    expect(flow.scaffolds[0]?.rules[0]?.outcome).toEqual({
      narrows: true,
      removed: ["Add a word bank with definitions"],
    });
    expect(flow.lesson[0]?.outcome).toBeUndefined();
  });

  it("lists scaffolds no teacher is offered separately, with every rule", () => {
    expect(
      flow.notOfferedScaffolds.map(({ kind, rules }) => [
        kind,
        rules.map(({ rule: { id } }) => id),
      ]),
    ).toEqual([
      ["chunking", ["status", "target", "key-stage"]],
      ["identity", []],
    ]);
  });

  it("anchors each rule to its entry in full", () => {
    expect(flow.capabilities[0]?.rules[0]?.anchor).toBe(
      "rule-capability-worksheetScaffolding-inputs",
    );
  });
});

describe("buildRuleFlow with shared rules set differently", () => {
  const target = (nodeType: string) =>
    rule({
      config: { target: { scope: "node", nodeTypes: [nodeType] } },
      displayValues: [nodeType],
      displayValuesLabel: "Applies to",
      id: "target",
    });
  const excludes = (kinds: string[]) =>
    rule({
      config: { kinds },
      displayValues: kinds,
      displayValuesLabel: "Can't be combined with",
      id: "excludes",
    });
  const scaffold = (kind: string, rules: RuleDescription[]) => ({
    capabilityIds: ["worksheetScaffolding"],
    kind,
    label: kind,
    rules,
    status: "active" as const,
  });
  const flow = buildRuleFlow({
    access: [],
    capabilities: [],
    gates: [],
    lesson: [
      rule({
        config: { subjectSlugs: ["french", "german"] },
        displayValues: ["French", "German"],
        id: "subject",
        kind: "subject",
      }),
    ],
    lessonMaterials: [],
    transformations: [
      scaffold("word-bank", [
        target("Question"),
        excludes([]),
        rule({
          config: { subjectSlugs: ["french"] },
          displayValues: ["French"],
          id: "mfl",
          kind: "subject",
        }),
      ]),
      scaffold("starters", [target("Question"), excludes(["Add sentence frames"])]),
      scaffold("recall", [target("Task"), excludes([])]),
    ],
  });

  it("marks a shared rule as set per scaffold when the configs differ", () => {
    expect(
      flow.commonScaffoldRules.map(({ rule: { id }, variesByScaffold }) => [
        id,
        variesByScaffold,
      ]),
    ).toEqual([
      ["target", true],
      ["excludes", true],
    ]);
  });

  it("gives each scaffold its own settings for those rules, leaving out empty ones", () => {
    expect(flow.scaffolds.map(({ kind, settings }) => [kind, settings])).toEqual([
      ["word-bank", [{ label: "Applies to", values: ["Question"] }]],
      [
        "starters",
        [
          { label: "Applies to", values: ["Question"] },
          { label: "Can't be combined with", values: ["Add sentence frames"] },
        ],
      ],
      ["recall", [{ label: "Applies to", values: ["Task"] }]],
    ]);
  });

  it("notes a subject rule the lesson-level subject rule already covers", () => {
    expect(flow.scaffolds[0]?.rules[0]?.note).toMatch(/No effect yet/);
  });
});
