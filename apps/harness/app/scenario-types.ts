import type {
  LessonContext,
  ResourceDocumentSummary,
} from "@oaknational/resource-adapter";

export type HarnessSection = "lessons" | "edge-cases" | "smoke-tests";

export type ExtractionDiagnostic = Readonly<{
  category: string;
  severity: string;
  message: string;
  nodeId: string | null;
}>;

export type LessonScenarioNavigationItem = Readonly<{
  id: string;
  title: string;
  keyStage: string;
  subject: string;
}>;

export type LessonScenario = Readonly<{
  id: string;
  description: string;
  lesson: LessonContext;
  programme: {
    examBoard: string | null;
    keyStage: string;
    subject: string;
    tier: string | null;
  };
  unit: {
    slug: string;
    title: string;
  };
  contentGuidance: readonly string[];
  originalFileResourceTypes: readonly string[];
  extractedResourceTypes: readonly string[];
  rights: string;
  rightsCheckedOn: string;
  sourceUrl: string;
  markup: string;
  documentSummary: ResourceDocumentSummary;
  diagnostics: readonly ExtractionDiagnostic[];
  unsupportedNodeIds: readonly string[];
}>;

export type EdgeCaseNavigationItem = Readonly<{
  id: string;
  title: string;
  summary: string;
}>;

export type EdgeCaseFact = Readonly<{ term: string; value: string }>;

export type EdgeCase = Readonly<{
  id: string;
  title: string;
  summary: string;
  expectation: string;
  reason: string;
  lesson: LessonContext;
  /** Sends the capabilities request somewhere that does not route. */
  brokenApiPath: boolean;
  facts: readonly EdgeCaseFact[];
  diagnostics: readonly ExtractionDiagnostic[];
  unsupportedNodeIds: readonly string[];
}>;

export type HarnessView =
  | Readonly<{
      section: "lessons";
      navigation: readonly LessonScenarioNavigationItem[];
      scenario: LessonScenario;
    }>
  | Readonly<{
      section: "edge-cases";
      navigation: readonly EdgeCaseNavigationItem[];
      edgeCase: EdgeCase;
    }>
  | Readonly<{ section: "smoke-tests" }>;
