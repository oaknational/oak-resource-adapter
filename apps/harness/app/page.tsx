import { HarnessPageClient } from "./_components/HarnessPageClient";
import { lessonScenarioNavigation, loadLessonScenario } from "./lesson-scenarios";
import type { HarnessSection } from "./scenario-types";

type HarnessPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function HarnessPage({ searchParams }: HarnessPageProps) {
  const parameters = await searchParams;
  const section: HarnessSection =
    parameters.view === "smoke-tests" ? "smoke-tests" : "lessons";
  const requestedScenario =
    typeof parameters.lesson === "string" ? parameters.lesson : undefined;
  const selectedNavigation =
    lessonScenarioNavigation.find((scenario) => scenario.id === requestedScenario) ??
    lessonScenarioNavigation[0];

  if (selectedNavigation === undefined) {
    throw new Error("The harness has no lesson scenarios.");
  }

  const selectedScenario = await loadLessonScenario(selectedNavigation.id);

  return (
    <HarnessPageClient
      scenarioNavigation={lessonScenarioNavigation}
      section={section}
      selectedScenario={selectedScenario}
    />
  );
}
