import { HarnessPageClient } from "./_components/HarnessPageClient";
import { edgeCaseNavigation, loadEdgeCase } from "./edge-cases";
import { lessonScenarioNavigation, loadLessonScenario } from "./lesson-scenarios";
import type { HarnessSection, HarnessView } from "./scenario-types";

type HarnessPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function parseSection(view: string | string[] | undefined): HarnessSection {
  if (view === "smoke-tests" || view === "edge-cases") {
    return view;
  }

  return "lessons";
}

function resolveId(
  requested: string | string[] | undefined,
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
  requestedCase: string | string[] | undefined,
): Promise<HarnessView> {
  if (section === "smoke-tests") {
    return { section };
  }

  if (section === "edge-cases") {
    const id = resolveId(
      requestedCase,
      edgeCaseNavigation,
      "The harness has no edge cases.",
    );

    return {
      section,
      navigation: edgeCaseNavigation,
      edgeCase: await loadEdgeCase(id),
    };
  }

  return {
    section,
    navigation: lessonScenarioNavigation,
    scenario: await loadLessonScenario(lessonId),
  };
}

export default async function HarnessPage({ searchParams }: HarnessPageProps) {
  const parameters = await searchParams;
  const section = parseSection(parameters.view);
  const lessonId = resolveId(
    parameters.lesson,
    lessonScenarioNavigation,
    "The harness has no lesson scenarios.",
  );

  return (
    <HarnessPageClient
      lessonId={lessonId}
      view={await resolveView(section, lessonId, parameters.case)}
    />
  );
}
