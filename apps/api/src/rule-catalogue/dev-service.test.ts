import { ruleCatalogueSchema } from "@oaknational/resource-adapter-dev-api-contracts";
import { describe, expect, it } from "vitest";

import { LESSON_RULES } from "../lesson-rules/rules";
import { transformationDefinitions } from "../transformations/registry";
import { getDevRuleCatalogue } from "./dev-service";

describe("getDevRuleCatalogue", () => {
  const catalogue = getDevRuleCatalogue();
  const transformation = (kind: string) =>
    catalogue.transformations.find((candidate) => candidate.kind === kind);

  it("serves plain data in the shape the harness reads", () => {
    expect(JSON.parse(JSON.stringify(catalogue))).toEqual(catalogue);
    expect(ruleCatalogueSchema.parse(catalogue)).toEqual(catalogue);
  });

  it("shows every lesson rule, in order, with the config it checks", () => {
    expect(catalogue.lesson.map(({ id }) => id)).toEqual(
      LESSON_RULES.map(({ id }) => id),
    );
    expect(catalogue.lesson.find(({ id }) => id === "subject")?.config).toBe(
      LESSON_RULES.find(({ id }) => id === "subject")?.config,
    );
  });

  it("lists each transformation's common rules before its own", () => {
    expect(transformation("scaffold-add-word-bank")?.rules.map(({ id }) => id)).toEqual(
      [
        "status",
        "material-source",
        "target",
        "excludes",
        "applied-once-per-target",
        "mfl",
      ],
    );
  });

  it("shows a rule that narrows rather than refuses", () => {
    expect(
      transformation("scaffold-add-word-bank")?.rules.find(({ id }) => id === "mfl"),
    ).toMatchObject({ removesSupportLevels: ["mid"], reads: ["lesson"] });
  });

  it("names the capabilities that offer each transformation", () => {
    expect(transformation("scaffold-add-word-bank")?.capabilityIds).toEqual([
      "worksheetScaffolding",
    ]);
    expect(transformation("identity")?.capabilityIds).toEqual([]);
  });

  it("serves the declared choices a narrowing rule removes from", () => {
    expect(transformation("scaffold-add-word-bank")?.inputs).toBe(
      transformationDefinitions["scaffold-add-word-bank"].inputs,
    );
  });
});
