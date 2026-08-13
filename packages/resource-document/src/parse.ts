import { ResourceDocumentParseError } from "./errors.js";
import { validateResourceDocumentInvariants } from "./invariants.js";
import { resourceDocumentSchema, type ResourceDocument } from "./schema/current.js";
import { RESOURCE_DOCUMENT_SCHEMA_VERSION_V0_1 } from "./schema/versions/v0_1.js";

export const CURRENT_SCHEMA_VERSION = RESOURCE_DOCUMENT_SCHEMA_VERSION_V0_1;
export const supportedSchemaVersions = [CURRENT_SCHEMA_VERSION] as const;
export type SchemaVersion = (typeof supportedSchemaVersions)[number];

const schemaVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export interface MigrationEdge {
  from: SchemaVersion;
  to: SchemaVersion;
}

export interface ResourceDocumentParseInfo {
  sourceSchemaVersion: SchemaVersion;
  migrationsApplied: readonly MigrationEdge[];
}

export type ResourceDocumentParseResult =
  | (ResourceDocumentParseInfo & {
      success: true;
      data: ResourceDocument;
    })
  | {
      success: false;
      error: ResourceDocumentParseError;
    };

function probeSchemaVersion(input: unknown): SchemaVersion {
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

  if (schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new ResourceDocumentParseError(
      "unsupported_schema_version",
      `Resource document schema version ${JSON.stringify(schemaVersion)} is not supported.`,
      { schemaVersion },
    );
  }

  return schemaVersion;
}

export function parseResourceDocumentWithInfo(
  input: unknown,
): ResourceDocumentParseInfo & { document: ResourceDocument } {
  const sourceSchemaVersion = probeSchemaVersion(input);
  const parsed = resourceDocumentSchema.safeParse(input);

  if (!parsed.success) {
    throw new ResourceDocumentParseError(
      "invalid_document",
      `Resource document does not match schema ${sourceSchemaVersion}.`,
      { schemaVersion: sourceSchemaVersion, issues: parsed.error.issues },
    );
  }

  const invariantIssues = validateResourceDocumentInvariants(parsed.data);
  if (invariantIssues.length > 0) {
    throw new ResourceDocumentParseError(
      "invariant_violation",
      `Resource document violates ${invariantIssues.length} cross-document invariant${invariantIssues.length === 1 ? "" : "s"}.`,
      { schemaVersion: sourceSchemaVersion, invariantIssues },
    );
  }

  return {
    document: parsed.data,
    sourceSchemaVersion,
    migrationsApplied: [],
  };
}

export function parseResourceDocument(input: unknown): ResourceDocument {
  return parseResourceDocumentWithInfo(input).document;
}

export function safeParseResourceDocument(input: unknown): ResourceDocumentParseResult {
  try {
    const { document, ...info } = parseResourceDocumentWithInfo(input);
    return { success: true, data: document, ...info };
  } catch (error) {
    if (error instanceof ResourceDocumentParseError) {
      return { success: false, error };
    }

    throw error;
  }
}

export function parseResourceDocumentJson(input: string): ResourceDocument {
  let json: unknown;
  try {
    json = JSON.parse(input);
  } catch {
    throw new ResourceDocumentParseError(
      "invalid_json",
      "Resource document input is not valid JSON.",
    );
  }

  return parseResourceDocument(json);
}
