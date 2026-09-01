"use client";

import { CapabilitiesView } from "./capabilities";
import { EdgeCaseView } from "./edge-cases";
import { LessonScenarioView } from "./lessons";
import { PrimaryNavigation, SiteHeader } from "./shared";
import { SmokeTestsView } from "./smoke-tests";
import { SuggestionsView } from "./suggestions";
import { TransformationsView } from "./transformations";
import { resolveApiBaseUrl } from "../harness-api";
import styles from "../page.module.css";
import { useApiHealth } from "../_hooks/useApiHealth";
import type { HarnessView } from "../scenario-types";

export function HarnessPageClient({
  lessonId,
  view,
}: Readonly<{ lessonId: string; view: HarnessView }>) {
  const apiBaseUrl = resolveApiBaseUrl();
  const apiHealthState = useApiHealth();

  return (
    <>
      <a className={styles.skipLink} href="#main-content">
        Skip to main content
      </a>
      <SiteHeader apiHealthState={apiHealthState} />
      <PrimaryNavigation lessonId={lessonId} section={view.section} />
      <main className={styles.main} id="main-content">
        {view.section === "capabilities" && <CapabilitiesView lessonId={lessonId} />}
        {view.section === "lessons" && (
          <LessonScenarioView
            apiBaseUrl={apiBaseUrl}
            scenario={view.scenario}
            scenarioNavigation={view.navigation}
          />
        )}
        {view.section === "edge-cases" && (
          <EdgeCaseView
            apiBaseUrl={apiBaseUrl}
            edgeCase={view.edgeCase}
            navigation={view.navigation}
          />
        )}
        {view.section === "smoke-tests" && <SmokeTestsView />}
        {view.section === "transformations" && (
          <TransformationsView
            initialKind={view.initialSelection}
            scenario={view.scenario}
            scenarioNavigation={view.navigation}
          />
        )}
        {view.section === "suggestions" && (
          <SuggestionsView
            initialFlowId={view.initialSelection}
            scenario={view.scenario}
            scenarioNavigation={view.navigation}
          />
        )}
      </main>
    </>
  );
}
