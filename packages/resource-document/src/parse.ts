import { ResourceDocumentParseError } from "./errors.js";
import { validateResourceDocumentInvariants } from "./invariants.js";
import { resourceDocumentSchemaVersions } from "./schema/versions/registry.js";
import type { ResourceDocument } from "./schema/types.js";
import { currentSchemaVersion, readVersionedDocument } from "./versioning.js";

export {
  ResourceDocumentParseError,
  type ResourceDocumentParseErrorCode,
  type ResourceDocumentParseErrorContext,
} from "./errors.js";

export const CURRENT_SCHEMA_VERSION = currentSchemaVersion(
  resourceDocumentSchemaVersions,
);
export const supportedSchemaVersions = resourceDocumentSchemaVersions.order;
export type SchemaVersion = (typeof supportedSchemaVersions)[number];

// Declared here rather than taken from versioning.ts, whose declarations
// import zod: this entry must stay usable without it.
export interface SchemaUpgradeStep {
  readonly from: SchemaVersion;
  readonly to: SchemaVersion;
}

export interface ResourceDocumentParseInfo {
  readonly sourceSchemaVersion: SchemaVersion;
  readonly upgradesApplied: readonly SchemaUpgradeStep[];
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

/**
 * Accepts any supported schema version and returns the document upgraded to
 * `CURRENT_SCHEMA_VERSION`. Invariants are checked on the upgraded document.
 */
export function parseResourceDocumentWithInfo(
  input: unknown,
): ResourceDocumentParseInfo & { document: ResourceDocument } {
  const read = readVersionedDocument(resourceDocumentSchemaVersions, input);

  const invariantIssues = validateResourceDocumentInvariants(read.document);
  if (invariantIssues.length > 0) {
    throw new ResourceDocumentParseError(
      "invariant_violation",
      `Resource document violates ${invariantIssues.length} cross-document invariant${invariantIssues.length === 1 ? "" : "s"}.`,
      { schemaVersion: read.sourceSchemaVersion, invariantIssues },
    );
  }

  return read;
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
