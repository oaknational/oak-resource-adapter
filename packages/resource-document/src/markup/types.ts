import type {
  AnswerAnnotation,
  Asset,
  ResourceDocument,
  ResourceDocumentDiagnostic,
  ResourceNode,
} from "../schema/types.js";

export type ResourceMarkupParseResult =
  | { success: true; data: ResourceDocument }
  | {
      success: false;
      error: import("../errors.js").ResourceDocumentParseError;
    };

export interface ParserState {
  answers: AnswerAnnotation[];
  assets: Map<string, Asset>;
  diagnostics: ResourceDocumentDiagnostic[];
  generatedIds: Map<string, number>;
}

export interface ParsedDirective {
  name: string;
  attributes: Record<string, string>;
  inner: string[];
  innerOffset: number;
  raw: string;
  line: number;
  nextIndex: number;
}

export type DirectiveHandler<Node extends ResourceNode | undefined> = (
  directive: ParsedDirective,
  state: ParserState,
  parseChildren: (directive: ParsedDirective) => ResourceNode[],
) => Node;
