import type { ResourceDocumentInvariantIssue } from "./invariants.js";

export type ResourceDocumentParseErrorCode =
  | "invalid_document"
  | "invalid_json"
  | "invalid_markup"
  | "invalid_schema_version"
  | "invariant_violation"
  | "missing_schema_version"
  | "unsupported_schema_version";

export interface ResourceDocumentParseErrorContext {
  schemaVersion?: string;
  /** 1-based line in the markup source, for `invalid_markup` errors. */
  line?: number;
  issues?: readonly unknown[];
  invariantIssues?: readonly ResourceDocumentInvariantIssue[];
}

export class ResourceDocumentParseError extends Error {
  readonly code: ResourceDocumentParseErrorCode;
  readonly context: ResourceDocumentParseErrorContext;

  constructor(
    code: ResourceDocumentParseErrorCode,
    message: string,
    context: ResourceDocumentParseErrorContext = {},
  ) {
    super(message);
    this.name = "ResourceDocumentParseError";
    this.code = code;
    this.context = context;
  }
}
