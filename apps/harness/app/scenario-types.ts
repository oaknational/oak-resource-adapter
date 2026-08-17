import type {
  LessonContext,
  ResourceDocumentSummary,
} from "@oaknational/resource-adapter";

export type HarnessSection = "lessons" | "smoke-tests";

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
}>;
