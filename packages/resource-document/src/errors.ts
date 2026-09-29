import type { ResourceDocumentInvariantIssue } from "./invariants.js";

export type ResourceDocumentParseErrorCode =
  | "invalid_document"
  | "invalid_json"
  | "invalid_markup"
  | "invalid_schema_version"
  | "invariant_violation"
  | "missing_schema_version"
  | "unsupported_schema_version"
  | "upgrade_failed"
  | "upgraded_document_invalid";

export interface ResourceDocumentParseErrorContext {
  /** The version the input declared, even when it failed after upgrading. */
  schemaVersion?: string;
  upgrade?: Readonly<{ from: string; to: string }>;
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
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ResourceDocumentParseError";
    this.code = code;
    this.context = context;
  }
}
