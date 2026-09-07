/**
 * The canonical document shape, declared without Zod so that consumers who only
 * need the types never have to resolve it. `schemas.ts` asserts every type here
 * against the schema that validates it, so the two cannot drift apart.
 */

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type NamespacedExtensions = Record<string, JsonValue>;

export interface TextRun {
  type: "text";
  text: string;
}

export interface MathRun {
  type: "math";
  value: string;
  display: boolean;
}

export type InlineRun = TextRun | MathRun;
export type InlineContent = InlineRun[];

export type LayoutBreak = "auto" | "page";
export type PreferredWidth = "content" | "full" | "half";

export interface LayoutIntent {
  keepTogether?: boolean | undefined;
  keepWithNext?: boolean | undefined;
  breakBefore?: LayoutBreak | undefined;
  breakAfter?: LayoutBreak | undefined;
  preferredWidth?: PreferredWidth | undefined;
}

export type CalloutRole = "learning-objective" | "instruction" | "note" | "warning";
export type ResponseSpaceKind = "lines" | "box" | "grid";
export type AnswerPlacement = "append" | "replace-response";
export type AssetAlternativeOrigin = "source" | "inferred" | "authored";
export type DefinitionSource = "generated" | "oak-lesson";

interface ResourceNodeBase {
  id: string;
  sourceRef?: string | undefined;
  layout?: LayoutIntent | undefined;
  extensions?: NamespacedExtensions | undefined;
}

export interface SectionNode extends ResourceNodeBase {
  type: "section";
  children: ResourceNode[];
}

export interface HeadingNode extends ResourceNodeBase {
  type: "heading";
  level: number;
  content: InlineContent;
}

export interface ParagraphNode extends ResourceNodeBase {
  type: "paragraph";
  content: InlineContent;
}

export interface CalloutNode extends ResourceNodeBase {
  type: "callout";
  role: CalloutRole;
  content: InlineContent;
}

export interface QuestionNode extends ResourceNodeBase {
  type: "question";
  label?: string | undefined;
  marks?: number | undefined;
  children: ResourceNode[];
}

export interface DefinitionEntry {
  term: InlineContent;
  /** Absent for a list of terms alone, such as a word bank without definitions. */
  definition?: InlineContent | undefined;
  example?: InlineContent | undefined;
  /**
   * Where the wording came from. `oak-lesson` marks a term Oak's own curriculum
   * defines, which a renderer may distinguish from one written to unlock a task.
   */
  source?: DefinitionSource | undefined;
}

/** A word bank, glossary or other list of terms, with or without definitions. */
export interface DefinitionListNode extends ResourceNodeBase {
  type: "definitionList";
  /** Introduces the list to the pupil. */
  lead?: InlineContent | undefined;
  entries: DefinitionEntry[];
}

export interface ResponseSpaceNode extends ResourceNodeBase {
  type: "responseSpace";
  kind: ResponseSpaceKind;
  lines?: number | undefined;
}

export interface FigureNode extends ResourceNodeBase {
  type: "figure";
  assetId: string;
  caption?: InlineContent | undefined;
}

export interface UnsupportedNode extends ResourceNodeBase {
  type: "unsupported";
  description: string;
  accessibleText?: string | undefined;
  original: {
    format: string;
    value: string;
  };
}

export type TableCell =
  { kind: "content"; content: InlineContent } | { kind: "answer" } | { kind: "empty" };

export interface TableNode extends ResourceNodeBase {
  type: "table";
  role: string;
  header?: TableCell[] | undefined;
  rows: TableCell[][];
}

export interface CodeBlockNode extends ResourceNodeBase {
  type: "codeBlock";
  language?: string | undefined;
  source: string;
}

export type ResourceNode =
  | TableNode
  | CodeBlockNode
  | SectionNode
  | HeadingNode
  | ParagraphNode
  | CalloutNode
  | QuestionNode
  | DefinitionListNode
  | ResponseSpaceNode
  | FigureNode
  | UnsupportedNode;

export interface AnswerAnnotation {
  id: string;
  targetId: string;
  placement: AnswerPlacement;
  content: ResourceNode[];
  sourceRef?: string | undefined;
  extensions?: NamespacedExtensions | undefined;
}

export type AssetAlternative =
  | { kind: "decorative" }
  | { kind: "text"; text: string; origin: AssetAlternativeOrigin }
  | { kind: "missing" };

export interface Asset {
  id: string;
  mediaType: string;
  contentRef: string;
  dimensions?: { width: number; height: number } | undefined;
  alternative: AssetAlternative;
  rights?: string | undefined;
  credit?: string | undefined;
  sourceRef?: string | undefined;
  extensions?: NamespacedExtensions | undefined;
}

export interface SourceRegion {
  source: string;
  page: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  readingOrder: number;
  confidence?: number | undefined;
}

export type SourceMap = Record<string, SourceRegion>;

export type DiagnosticCategory =
  | "uncertain-reading-order"
  | "uncertain-semantics"
  | "layout-fidelity-loss"
  | "missing-asset"
  | "unsupported-annotation"
  | "unsupported-markup"
  | "rights-or-provenance-unknown"
  | "fixed-layout-fallback";

export type DiagnosticSeverity = "info" | "warning" | "error";

export interface ResourceDocumentDiagnostic {
  category: DiagnosticCategory;
  severity: DiagnosticSeverity;
  message: string;
  nodeId?: string | undefined;
  sourceRef?: string | undefined;
  confidence?: number | undefined;
  fallback?: string | undefined;
  reviewRequired: boolean;
}

export interface DocumentProvenance {
  source: {
    system: string;
    id: string;
    uri?: string | undefined;
    checksum?: { algorithm: "sha256"; value: string } | undefined;
  };
  producer: {
    name: string;
    version: string;
  };
}

export interface CurriculumContext {
  id: string;
  label?: string | undefined;
}

export interface WorksheetMetadata {
  title: string;
  subject?: CurriculumContext | undefined;
  keyStage?: CurriculumContext | undefined;
  yearGroup?: CurriculumContext | undefined;
  targetReadingAge?: number | undefined;
}

export interface GenericMetadata {
  title?: string | undefined;
}

interface DocumentBase {
  schemaVersion: "0.1";
  id: string;
  language: string;
  content: ResourceNode[];
  answers: AnswerAnnotation[];
  assets: Asset[];
  provenance: DocumentProvenance;
  sourceMap?: SourceMap | undefined;
  diagnostics: ResourceDocumentDiagnostic[];
  extensions?: NamespacedExtensions | undefined;
}

export interface WorksheetDocument extends DocumentBase {
  profile: "worksheet.v0";
  metadata: WorksheetMetadata;
}

export interface GenericDocument extends DocumentBase {
  profile: "generic.v0";
  metadata: GenericMetadata;
}

export type ResourceDocument = WorksheetDocument | GenericDocument;
