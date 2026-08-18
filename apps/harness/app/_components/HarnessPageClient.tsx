"use client";

import { EdgeCaseView } from "./EdgeCaseView";
import { LessonScenarioView } from "./LessonScenarioView";
import { PrimaryNavigation } from "./PrimaryNavigation";
import { SiteHeader } from "./SiteHeader";
import { SmokeTestsView } from "./SmokeTestsView";
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
      </main>
    </>
  );
}
