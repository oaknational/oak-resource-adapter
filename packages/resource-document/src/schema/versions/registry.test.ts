import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CURRENT_SCHEMA_VERSION, parseResourceDocumentWithInfo } from "../../parse.js";
import { resourceDocumentSchema } from "../current.js";
import { resourceVocabulary } from "../../vocabulary.js";
import { schemaVersionPattern } from "../../versioning.js";
import { resourceDocumentSchemaVersions } from "./registry.js";

const frozenDocuments = resourceDocumentSchemaVersions.order.flatMap((version) => {
  const directory = new URL(`./v${version.replace(".", "_")}/frozen/`, import.meta.url);
  return readdirSync(directory).map((file) => ({
    version,
    name: `${version}/${file}`,
    input: JSON.parse(readFileSync(new URL(file, directory), "utf8")) as unknown,
  }));
});

describe("resource document schema versions", () => {
  it("registers well-formed versions in increasing order, ending at the current schema", () => {
    const { order, schemas } = resourceDocumentSchemaVersions;
    for (const version of order) {
      expect(version).toMatch(schemaVersionPattern);
    }
    expect(order).toEqual(
      order.toSorted((left, right) =>
        left.localeCompare(right, "en", { numeric: true }),
      ),
    );
    expect(new Set(order).size).toBe(order.length);
    expect(schemas[CURRENT_SCHEMA_VERSION]).toBe(resourceDocumentSchema);
  });

  it("covers every node type in the current version's frozen documents", () => {
    const types = new Set<unknown>();
    const collect = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(collect);
      } else if (typeof value === "object" && value !== null) {
        if ("type" in value) types.add(value.type);
        Object.values(value).forEach(collect);
      }
    };
    frozenDocuments
      .filter(({ version }) => version === CURRENT_SCHEMA_VERSION)
      .forEach(({ input }) => collect(input));

    expect(
      Object.keys(resourceVocabulary.nodes).filter((type) => !types.has(type)),
    ).toEqual([]);
  });

  it("has a frozen document for every version", () => {
    expect(new Set(frozenDocuments.map(({ version }) => version))).toEqual(
      new Set(resourceDocumentSchemaVersions.order),
    );
  });

  // Keep frozen inputs unchanged. Fix incompatible schema changes or broken
  // upgrades instead of updating these fixtures.
  it.each(frozenDocuments)(
    "preserves $name in its declared schema",
    ({ version, input }) => {
      expect(resourceDocumentSchemaVersions.schemas[version].parse(input)).toEqual(
        input,
      );
    },
  );

  it.each(frozenDocuments)("still reads $name", ({ version, input }) => {
    const read = parseResourceDocumentWithInfo(input);
    expect(read.sourceSchemaVersion).toBe(version);
    expect(read.document.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });
});
