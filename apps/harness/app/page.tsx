import {
  loadOriginalResourceDocumentFixture,
  originalResourceDocumentFixtureManifest,
} from "@oaknational/resource-adapter-original-resource-documents/fixtures";

import { HarnessPageClient } from "./_components/HarnessPageClient";
import { edgeCaseNavigation, loadEdgeCase } from "./edge-cases";
import { lessonScenarioNavigation, loadLessonScenario } from "./lesson-scenarios";
import type { HarnessSection, HarnessView } from "./scenario-types";

type SearchParamValue = string | string[] | undefined;
type SearchParam = string | undefined;

type HarnessPageProps = Readonly<{
  searchParams: Promise<Record<string, SearchParamValue>>;
}>;

// A repeated query parameter arrives as an array; first wins, as URLSearchParams does.
function firstValue(value: SearchParamValue): SearchParam {
  return Array.isArray(value) ? value[0] : value;
}

function parseSection(view: SearchParam): HarnessSection {
  if (
    view === "capabilities" ||
    view === "smoke-tests" ||
    view === "edge-cases" ||
    view === "suggestions" ||
    view === "exports" ||
    view === "transformations"
  ) {
    return view;
  }

  return "lessons";
}

function resolveId(
  requested: SearchParam,
  available: readonly { id: string }[],
  emptyMessage: string,
): string {
  const fallback = available[0];

  if (fallback === undefined) {
    throw new Error(emptyMessage);
  }

  const match = available.find((candidate) => candidate.id === requested);

  return match?.id ?? fallback.id;
}

async function resolveView(
  section: HarnessSection,
  lessonId: string,
  parameters: Record<string, SearchParam>,
): Promise<HarnessView> {
  if (section === "capabilities" || section === "smoke-tests") {
    return { section };
  }

  if (section === "edge-cases") {
    const id = resolveId(
      parameters.case,
      edgeCaseNavigation,
      "The harness has no edge cases.",
    );

    return {
      section,
      navigation: edgeCaseNavigation,
      edgeCase: await loadEdgeCase(id),
    };
  }

  if (section === "exports") {
    const fixtureId = resolveId(
      parameters.fixture,
      originalResourceDocumentFixtureManifest,
      "The harness has no export fixtures.",
    );
    const fixture = await loadOriginalResourceDocumentFixture(fixtureId);

    return {
      section,
      fixtureId,
      resourceDocument: fixture.expectedDocument,
      fixtures: originalResourceDocumentFixtureManifest.map(({ id, title }) => ({
        id,
        title,
      })),
    };
  }

  if (section === "transformations" || section === "suggestions") {
    const selection = parameters.selection;

    return {
      ...(typeof selection === "string" ? { initialSelection: selection } : {}),
      section,
      navigation: lessonScenarioNavigation,
      scenario: await loadLessonScenario(lessonId),
    };
  }

  return {
    section,
    navigation: lessonScenarioNavigation,
    scenario: await loadLessonScenario(lessonId),
  };
}

export default async function HarnessPage({ searchParams }: HarnessPageProps) {
  const parameters = Object.fromEntries(
    Object.entries(await searchParams).map(([name, value]) => [
      name,
      firstValue(value),
    ]),
  );
  const section = parseSection(parameters.view);
  const lessonId = resolveId(
    parameters.lesson,
    lessonScenarioNavigation,
    "The harness has no lesson scenarios.",
  );

  return (
    <HarnessPageClient
      lessonId={lessonId}
      view={await resolveView(section, lessonId, parameters)}
    />
  );
}
