import type { RuleDescription } from "@oaknational/resource-adapter-dev-api-contracts";
import { describe, expect, it } from "vitest";

import { configLines, readsLabels } from "./rule-details";

const rule = (overrides: Partial<RuleDescription> = {}): RuleDescription => ({
  condition: "A condition",
  config: {},
  id: "test",
  kind: "test",
  label: "Test",
  reads: ["lesson"],
  ...overrides,
});

describe("readsLabels", () => {
  it("names a rule that reads nothing as the same everywhere", () => {
    expect(readsLabels(rule({ reads: [] }))).toEqual(["Same everywhere"]);
    expect(readsLabels(rule({ reads: ["lesson", "teacher"] }))).toEqual([
      "Lesson",
      "Teacher",
    ]);
  });
});

describe("configLines", () => {
  it("labels keys in sentence case and keeps lists, values and groups apart", () => {
    expect(
      configLines({
        subjectSlugs: ["art", "music"],
        featureKey: "expired",
        target: { scope: "node", nodeTypes: ["question"] },
      }),
    ).toEqual([
      {
        key: "subjectSlugs",
        label: "Subject slugs",
        value: { kind: "list", items: ["art", "music"] },
      },
      {
        key: "featureKey",
        label: "Feature key",
        value: { kind: "text", text: "expired" },
      },
      {
        key: "target",
        label: "Target",
        value: {
          kind: "group",
          lines: [
            { key: "scope", label: "Scope", value: { kind: "text", text: "node" } },
            {
              key: "nodeTypes",
              label: "Node types",
              value: { kind: "list", items: ["question"] },
            },
          ],
        },
      },
    ]);
  });
});
