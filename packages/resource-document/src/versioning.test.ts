import { describe, expect, it } from "vitest";
import * as z from "zod";

import { defineSchemaVersions, readVersionedDocument } from "./versioning.js";

const nameSchema = z.strictObject({
  schemaVersion: z.literal("1.0"),
  name: z.string(),
});
const fullNameSchema = z.strictObject({
  schemaVersion: z.literal("1.1"),
  fullName: z.string(),
});
const taggedSchema = z.strictObject({
  schemaVersion: z.literal("1.2"),
  fullName: z.string().min(1),
  tags: z.array(z.string()),
});

const toyVersions = defineSchemaVersions({
  order: ["1.0", "1.1", "1.2"],
  schemas: { "1.0": nameSchema, "1.1": fullNameSchema, "1.2": taggedSchema },
}).withUpgrades({
  "1.1": ({ name }) => ({ schemaVersion: "1.1", fullName: name }),
  "1.2": (document) => ({ ...document, schemaVersion: "1.2", tags: [] }),
});

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe("versioned document reading", () => {
  it("applies no upgrades to a current document", () => {
    const input = { schemaVersion: "1.2", fullName: "Ada", tags: ["x"] };
    expect(readVersionedDocument(toyVersions, input)).toEqual({
      document: input,
      sourceSchemaVersion: "1.2",
      upgradesApplied: [],
    });
  });

  it("upgrades through every later version in order", () => {
    const input = deepFreeze({ schemaVersion: "1.0", name: "Ada" });
    const first = readVersionedDocument(toyVersions, input);

    expect(first).toEqual({
      document: { schemaVersion: "1.2", fullName: "Ada", tags: [] },
      sourceSchemaVersion: "1.0",
      upgradesApplied: [
        { from: "1.0", to: "1.1" },
        { from: "1.1", to: "1.2" },
      ],
    });
    expect(readVersionedDocument(toyVersions, input)).toEqual(first);
  });

  it("starts from the declared version", () => {
    const read = readVersionedDocument(toyVersions, {
      schemaVersion: "1.1",
      fullName: "Ada",
    });
    expect(read.upgradesApplied).toEqual([{ from: "1.1", to: "1.2" }]);
  });

  it.each([
    [{}, "missing_schema_version"],
    [{ schemaVersion: 1.1 }, "invalid_schema_version"],
    [{ schemaVersion: "1.1.0" }, "invalid_schema_version"],
    [{ schemaVersion: "1.3" }, "unsupported_schema_version"],
  ])("classifies version input %#", (input, code) => {
    expect(() => readVersionedDocument(toyVersions, input)).toThrow(
      expect.objectContaining({ code }),
    );
  });

  it("rejects a document that does not match its declared version", () => {
    expect(() =>
      readVersionedDocument(toyVersions, { schemaVersion: "1.0", fullName: "Ada" }),
    ).toThrow(
      expect.objectContaining({
        code: "invalid_document",
        context: expect.objectContaining({ schemaVersion: "1.0" }),
      }),
    );
  });

  it("reports the step whose upgrade threw", () => {
    const cause = new Error("boom");
    const throwing = defineSchemaVersions({
      order: ["1.0", "1.1"],
      schemas: { "1.0": nameSchema, "1.1": fullNameSchema },
    }).withUpgrades({
      "1.1": () => {
        throw cause;
      },
    });

    expect(() =>
      readVersionedDocument(throwing, { schemaVersion: "1.0", name: "Ada" }),
    ).toThrow(
      expect.objectContaining({
        code: "upgrade_failed",
        context: { schemaVersion: "1.0", upgrade: { from: "1.0", to: "1.1" } },
        cause,
      }),
    );
  });

  it("re-parses every upgrade against its target schema", () => {
    expect(() =>
      readVersionedDocument(toyVersions, { schemaVersion: "1.0", name: "" }),
    ).toThrow(
      expect.objectContaining({
        code: "upgraded_document_invalid",
        context: expect.objectContaining({
          schemaVersion: "1.0",
          upgrade: { from: "1.1", to: "1.2" },
        }),
      }),
    );
  });
});

// Compile-time checks: `pnpm type-check` fails if any of these stops being an
// error.
const pair = defineSchemaVersions({
  order: ["1.0", "1.1"],
  schemas: { "1.0": nameSchema, "1.1": fullNameSchema },
});
// @ts-expect-error missing the 1.1 upgrade
pair.withUpgrades({});
// @ts-expect-error the upgrade must produce 1.1 input
pair.withUpgrades({ "1.1": (document) => document });
defineSchemaVersions({
  order: ["1.0"],
  schemas: { "1.0": nameSchema },
}).withUpgrades({
  // @ts-expect-error an upgrade with no version before it
  "1.0": (document: unknown) => document,
});
defineSchemaVersions({
  order: ["1.0", "1.1"],
  // @ts-expect-error each schema must declare its own version
  schemas: { "1.0": nameSchema, "1.1": nameSchema },
});
