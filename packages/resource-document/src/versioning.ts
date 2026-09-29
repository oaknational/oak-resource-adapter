import type * as z from "zod";

import { ResourceDocumentParseError } from "./errors.js";

export const schemaVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

type VersionedSchema<Version extends string> = z.ZodType<{ schemaVersion: Version }>;

type SchemaOf<Schemas, Version> = Version extends keyof Schemas
  ? Schemas[Version]
  : never;

type Previous<
  Order extends readonly string[],
  Version extends string,
> = Order extends readonly [
  infer Before extends string,
  infer After extends string,
  ...infer Rest extends string[],
]
  ? After extends Version
    ? Before
    : Previous<readonly [After, ...Rest], Version>
  : never;

type Last<Order extends readonly string[]> = Order extends readonly [
  ...string[],
  infer Version extends string,
]
  ? Version
  : never;

type LaterVersions<Order extends readonly [string, ...string[]]> = Exclude<
  Order[number],
  Order[0]
>;

// `{}` would accept any object, so a lone version forbids every key instead.
type Upgrades<
  Order extends readonly [string, ...string[]],
  Schemas extends SchemaVersions<Order>,
> = [LaterVersions<Order>] extends [never]
  ? Readonly<Record<string, never>>
  : {
      readonly [Version in LaterVersions<Order>]: (
        document: z.output<SchemaOf<Schemas, Previous<Order, Version>>>,
      ) => z.input<SchemaOf<Schemas, Version>>;
    };

type SchemaVersions<Order extends readonly [string, ...string[]]> = {
  readonly [Version in Order[number]]: VersionedSchema<Version>;
};

export type SchemaVersionRegistry<
  Order extends readonly [string, ...string[]],
  Schemas extends SchemaVersions<Order>,
> = Readonly<{
  /** Oldest first; the last entry is the current version. */
  order: Order;
  schemas: Schemas;
  /** Keyed by the version each upgrade produces from the one before it. */
  upgrades: Upgrades<Order, Schemas>;
}>;

export type UpgradeStep<Version extends string = string> = Readonly<{
  from: Version;
  to: Version;
}>;

export type VersionedRead<Version extends string, Document> = Readonly<{
  document: Document;
  sourceSchemaVersion: Version;
  upgradesApplied: readonly UpgradeStep<Version>[];
}>;

/**
 * Curried so the versions are fixed before the upgrades are checked; in one
 * call TypeScript cannot infer the upgrade parameter types.
 */
export function defineSchemaVersions<
  const Order extends readonly [string, ...string[]],
  Schemas extends SchemaVersions<Order>,
>(versions: Readonly<{ order: Order; schemas: Schemas }>) {
  return {
    withUpgrades: (
      upgrades: SchemaVersionRegistry<Order, Schemas>["upgrades"],
    ): SchemaVersionRegistry<Order, Schemas> => ({ ...versions, upgrades }),
  };
}

export function currentSchemaVersion<Order extends readonly [string, ...string[]]>(
  registry: Readonly<{ order: Order }>,
): Last<Order> {
  return registry.order[registry.order.length - 1] as Last<Order>;
}

function probeSchemaVersion<Version extends string>(
  input: unknown,
  order: readonly Version[],
): Version {
  if (
    input === null ||
    typeof input !== "object" ||
    !Object.hasOwn(input, "schemaVersion")
  ) {
    throw new ResourceDocumentParseError(
      "missing_schema_version",
      "Resource document input must declare schemaVersion.",
    );
  }

  const schemaVersion = (input as { schemaVersion?: unknown }).schemaVersion;
  if (typeof schemaVersion !== "string" || !schemaVersionPattern.test(schemaVersion)) {
    throw new ResourceDocumentParseError(
      "invalid_schema_version",
      "schemaVersion must be an exact two-component version string such as 0.1.",
    );
  }

  const supported = order.find((version) => version === schemaVersion);
  if (supported === undefined) {
    throw new ResourceDocumentParseError(
      "unsupported_schema_version",
      `Resource document schema version ${JSON.stringify(schemaVersion)} is not supported.`,
      { schemaVersion },
    );
  }

  return supported;
}

/**
 * Parses `input` against the schema of the exact version it declares, then
 * upgrades it one version at a time to the current version, re-parsing after
 * every step. The input is never modified.
 */
export function readVersionedDocument<
  Order extends readonly [string, ...string[]],
  Schemas extends SchemaVersions<Order>,
>(
  registry: SchemaVersionRegistry<Order, Schemas>,
  input: unknown,
): VersionedRead<Order[number], z.output<SchemaOf<Schemas, Last<Order>>>> {
  const schemas = registry.schemas as Readonly<Record<string, z.ZodType>>;
  const upgrades = registry.upgrades as Readonly<
    Record<string, (document: unknown) => unknown>
  >;
  const sourceSchemaVersion = probeSchemaVersion<Order[number]>(input, registry.order);

  const parsed = schemas[sourceSchemaVersion]!.safeParse(input);
  if (!parsed.success) {
    throw new ResourceDocumentParseError(
      "invalid_document",
      `Resource document does not match schema ${sourceSchemaVersion}.`,
      { schemaVersion: sourceSchemaVersion, issues: parsed.error.issues },
    );
  }

  let document = parsed.data;
  const upgradesApplied: UpgradeStep<Order[number]>[] = [];
  const pending = registry.order.slice(registry.order.indexOf(sourceSchemaVersion) + 1);
  for (const to of pending) {
    const upgrade = { from: upgradesApplied.at(-1)?.to ?? sourceSchemaVersion, to };

    let upgraded: unknown;
    try {
      upgraded = upgrades[to]!(document);
    } catch (cause) {
      throw new ResourceDocumentParseError(
        "upgrade_failed",
        `Resource document could not be upgraded from ${upgrade.from} to ${upgrade.to}.`,
        { schemaVersion: sourceSchemaVersion, upgrade },
        { cause },
      );
    }

    const reparsed = schemas[to]!.safeParse(upgraded);
    if (!reparsed.success) {
      throw new ResourceDocumentParseError(
        "upgraded_document_invalid",
        `Resource document upgraded from ${upgrade.from} does not match schema ${upgrade.to}.`,
        { schemaVersion: sourceSchemaVersion, upgrade, issues: reparsed.error.issues },
      );
    }

    document = reparsed.data;
    upgradesApplied.push(upgrade);
  }

  return {
    document: document as z.output<SchemaOf<Schemas, Last<Order>>>,
    sourceSchemaVersion,
    upgradesApplied,
  };
}
