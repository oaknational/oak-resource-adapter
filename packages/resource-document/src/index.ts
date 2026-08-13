export {
  answerAnnotationSchema,
  assetSchema,
  genericDocumentSchema,
  genericMetadataSchema,
  inlineContentSchema,
  inlineRunSchema,
  layoutIntentSchema,
  mathRunSchema,
  resourceDocumentDiagnosticSchema,
  resourceDocumentSchema,
  resourceNodeSchema,
  sourceMapSchema,
  textRunSchema,
  worksheetDocumentSchema,
  worksheetMetadataSchema,
} from "./schema/current.js";
export type {
  AnswerAnnotation,
  Asset,
  CalloutNode,
  DocumentProvenance,
  FigureNode,
  GenericDocument,
  HeadingNode,
  InlineContent,
  InlineRun,
  LayoutIntent,
  NamespacedExtensions,
  ParagraphNode,
  QuestionNode,
  ResourceDocument,
  ResourceDocumentDiagnostic,
  ResourceNode,
  ResponseSpaceNode,
  SectionNode,
  SourceMap,
  UnsupportedNode,
  WorksheetDocument,
} from "./schema/current.js";
export {
  CURRENT_SCHEMA_VERSION,
  parseResourceDocument,
  parseResourceDocumentJson,
  parseResourceDocumentWithInfo,
  safeParseResourceDocument,
  supportedSchemaVersions,
} from "./parse.js";
export type {
  MigrationEdge,
  ResourceDocumentParseInfo,
  ResourceDocumentParseResult,
  SchemaVersion,
} from "./parse.js";
export {
  ResourceDocumentParseError,
  type ResourceDocumentParseErrorCode,
  type ResourceDocumentParseErrorContext,
} from "./errors.js";
export {
  validateResourceDocumentInvariants,
  type ResourceDocumentInvariantCode,
  type ResourceDocumentInvariantIssue,
} from "./invariants.js";
export {
  getResourceNodeById,
  getResourceNodesByType,
  walkResourceDocument,
  type ResourceDocumentTraversalOptions,
  type ResourceNodeOfType,
} from "./traversal.js";
