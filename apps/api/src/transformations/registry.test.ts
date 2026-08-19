import { renderPromptTemplate } from "@oaknational/resource-adapter-ai";
import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import { beforeAll, describe, expect, it } from "vitest";

import type { ResourceDocument } from "@oaknational/resource-document";

import { capabilityDefinitions } from "../capabilities/registry";
import { identityTransformation } from "./definitions/identity";
import {
  isRegisteredTransformationKind,
  parseTransformationParams,
  transformationDefinitions,
} from "./registry";
import { SUPPORT_LEVELS } from "./support-level";

const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

const definitions = Object.entries(transformationDefinitions);

const modelDefinitions = definitions.flatMap(([, definition]) =>
  definition.execution.strategy === "model"
    ? [{ definition, prompt: definition.execution.prompt }]
    : [],
);

function placeholdersIn(template: string): readonly string[] {
  return [...template.matchAll(PLACEHOLDER_PATTERN)].map(([, name]) => name ?? "");
}

describe("transformationDefinitions", () => {
  it.each(definitions)("keys %s by its own kind", (kind, definition) => {
    expect(definition.kind).toBe(kind);
  });

  it.each(definitions)("gives %s a teacher-facing label", (_kind, definition) => {
    expect(definition.label.trim()).not.toBe("");
  });

  it("gives every kind a distinct label", () => {
    const labels = definitions.map(([, definition]) => definition.label);

    expect(new Set(labels).size).toBe(labels.length);
  });

  it.each(definitions.filter(([, definition]) => definition.status === "active"))(
    "gives active model kind %s a contribution",
    (_kind, definition) => {
      if (definition.execution.strategy === "model") {
        expect(
          "contribution" in definition.execution
            ? definition.execution.contribution
            : undefined,
        ).toBeDefined();
      }
    },
  );

  it.each(definitions)("rejects unknown params for %s", (_kind, definition) => {
    expect(definition.params.safeParse({ unexpected: true }).success).toBe(false);
  });

  it.each(definitions)("accepts the params %s declares", (_kind, definition) => {
    const { supportLevels } = definition;

    if (supportLevels === undefined) {
      expect(definition.params.safeParse({}).success).toBe(true);
      return;
    }

    const declared = supportLevels.map(({ level }) => level);
    expect(declared.length).toBeGreaterThan(0);

    for (const supportLevel of declared) {
      expect(definition.params.safeParse({ supportLevel }).success).toBe(true);
    }

    for (const supportLevel of SUPPORT_LEVELS.filter(
      (level) => !declared.includes(level),
    )) {
      expect(definition.params.safeParse({ supportLevel }).success).toBe(false);
    }
  });

  it("orders each kind's support levels weakest first", () => {
    for (const [, definition] of definitions) {
      const { supportLevels } = definition;

      if (supportLevels === undefined) {
        continue;
      }

      const ranked = supportLevels.map(({ level }) => SUPPORT_LEVELS.indexOf(level));

      expect(ranked).toEqual([...ranked].sort((first, second) => first - second));
    }
  });

  it("recognises a registered kind and rejects an unregistered one", () => {
    expect(isRegisteredTransformationKind("identity")).toBe(true);
    expect(isRegisteredTransformationKind("scaffold-invent-a-worksheet")).toBe(false);
  });

  it("parses params through the kind's own schema", () => {
    expect(parseTransformationParams("identity", {})).toEqual({});
    expect(() => parseTransformationParams("identity", { unexpected: true })).toThrow();
  });
});

describe("capability transformations", () => {
  it.each(Object.values(capabilityDefinitions))(
    "declares only registered kinds for $id",
    (capability) => {
      for (const kind of capability.transformations) {
        expect(isRegisteredTransformationKind(kind)).toBe(true);
        expect(transformationDefinitions[kind].status).toBe("active");
      }
    },
  );
});

describe("prompts", () => {
  it.each(modelDefinitions)(
    "names $definition.kind as its prompt identifier",
    ({ definition, prompt }) => {
      expect(prompt.identifier).toBe(definition.kind);
      expect(prompt.version).toBeGreaterThanOrEqual(1);
    },
  );

  it.each(modelDefinitions)(
    "gives $definition.kind the document it transforms",
    ({ prompt }) => {
      expect(placeholdersIn(prompt.template)).toContain("document");
    },
  );

  it.each(
    modelDefinitions.filter(({ definition }) => definition.target.scope === "node"),
  )("gives block-targeted $definition.kind the block it transforms", ({ prompt }) => {
    expect(placeholdersIn(prompt.template)).toContain("block");
  });

  it.each(
    modelDefinitions.filter(
      ({ definition }) => (definition.supportLevels ?? []).length > 1,
    ),
  )("gives $definition.kind the support level it was asked for", ({ prompt }) => {
    expect(placeholdersIn(prompt.template)).toContain("supportLevel");
  });

  it.each(modelDefinitions)(
    "asks for lesson material exactly when $definition.kind declares some",
    ({ definition, prompt }) => {
      const declares = (definition.materialRequirements ?? []).length > 0;

      expect(placeholdersIn(prompt.template).includes("lessonMaterial")).toBe(declares);
    },
  );

  it.each(modelDefinitions)("renders $definition.kind", ({ prompt }) => {
    const variables = Object.fromEntries(
      placeholdersIn(prompt.template).map((name) => [name, `<${name}>`]),
    );

    const render = renderPromptTemplate as (
      template: typeof prompt,
      values: Record<string, string>,
    ) => string;
    expect(render(prompt, variables)).not.toContain("{{");
  });
});

describe("identity", () => {
  let document: ResourceDocument;

  beforeAll(async () => {
    document = await originalResourceDocuments.get({
      source: "oak",
      lessonSlug: "adopting-different-perspectives",
      programmeSlug: "english-primary-ks2",
      resourceType: "worksheet",
    });
  });

  it("returns the document it was given", () => {
    const { execution } = identityTransformation;

    expect(execution.strategy).toBe("deterministic");
    if (execution.strategy !== "deterministic") {
      return;
    }

    expect(execution.apply(document)).toEqual([document]);
  });
});
