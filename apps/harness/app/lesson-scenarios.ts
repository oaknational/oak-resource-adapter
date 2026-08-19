import {
  getResourceNodesByType,
  walkResourceDocument,
} from "@oaknational/resource-document";
import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";
import { originalResourceDocumentFixtureManifest } from "@oaknational/resource-adapter-original-resource-documents/fixtures";

import type { LessonScenario, LessonScenarioNavigationItem } from "./scenario-types";
import type { LessonResourceType } from "@oaknational/resource-adapter";

/** Oak publishes more resource types than the adapter contract can carry. */
const adapterResourceTypes = [
  "worksheet",
  "starter-quiz",
] as const satisfies readonly LessonResourceType[];

const oakLessonFixtureEntries = originalResourceDocumentFixtureManifest.filter(
  (entry) => "oakLesson" in entry,
);

export const lessonScenarioNavigation: readonly LessonScenarioNavigationItem[] =
  oakLessonFixtureEntries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    keyStage: entry.oakLesson.programme.keyStage,
    subject: entry.oakLesson.programme.subject,
  }));

export async function loadLessonScenario(id: string): Promise<LessonScenario> {
  const entry = oakLessonFixtureEntries.find((candidate) => candidate.id === id);
  if (entry === undefined) {
    throw new Error(`Unknown lesson scenario ${JSON.stringify(id)}.`);
  }

  const oakLesson = entry.oakLesson;
  const lessonRef = {
    source: "oak",
    lessonSlug: oakLesson.lessonSlug,
    programmeSlug: oakLesson.programmeSlug,
  } as const;
  const worksheet = { ...lessonRef, resourceType: "worksheet" } as const;
  const [markup, document, extractedResourceTypes] = await Promise.all([
    originalResourceDocuments.getMarkup(worksheet),
    originalResourceDocuments.get(worksheet),
    originalResourceDocuments.listExtractedResourceTypes(lessonRef),
  ]);

  return {
    id: entry.id,
    description: entry.description,
    lesson: {
      lessonSlug: oakLesson.lessonSlug,
      programmeSlug: oakLesson.programmeSlug,
      title: entry.title,
      subjectSlug: oakLesson.programme.subjectSlug,
      keyStageSlug: oakLesson.programme.keyStageSlug,
      availableResources: adapterResourceTypes.filter((resourceType) =>
        oakLesson.originalFileResourceTypes.includes(resourceType),
      ),
    },
    programme: {
      examBoard: oakLesson.programme.examBoard,
      keyStage: oakLesson.programme.keyStage,
      subject: oakLesson.programme.subject,
      tier: oakLesson.programme.tier,
    },
    unit: oakLesson.unit,
    contentGuidance: oakLesson.contentGuidance,
    originalFileResourceTypes: oakLesson.originalFileResourceTypes,
    extractedResourceTypes,
    rights: entry.rights,
    rightsCheckedOn: oakLesson.rightsCheckedOn,
    sourceUrl: oakLesson.sourceUrl,
    markup,
    document,
    diagnostics: document.diagnostics.map((diagnostic) => ({
      category: diagnostic.category,
      severity: diagnostic.severity,
      message: diagnostic.message,
      nodeId: diagnostic.nodeId ?? null,
    })),
    unsupportedNodeIds: getResourceNodesByType(document, "unsupported").map(
      (node) => node.id,
    ),
    documentSummary: {
      id: document.id,
      title: document.metadata.title ?? entry.title,
      profile: document.profile,
      schemaVersion: document.schemaVersion,
      contentNodeCount: Array.from(walkResourceDocument(document)).length,
      questionCount: getResourceNodesByType(document, "question").length,
      assetCount: document.assets.length,
      diagnosticCount: document.diagnostics.length,
    },
  };
}
