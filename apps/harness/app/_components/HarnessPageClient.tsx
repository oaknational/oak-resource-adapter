"use client";

import { LessonScenarioView } from "./LessonScenarioView";
import { PrimaryNavigation } from "./PrimaryNavigation";
import { SiteHeader } from "./SiteHeader";
import { SmokeTestsView } from "./SmokeTestsView";
import { resolveApiBaseUrl } from "../harness-api";
import styles from "../page.module.css";
import { useApiHealth } from "../_hooks/useApiHealth";
import type {
  HarnessSection,
  LessonScenario,
  LessonScenarioNavigationItem,
} from "../scenario-types";

export function HarnessPageClient({
  scenarioNavigation,
  section,
  selectedScenario,
}: Readonly<{
  scenarioNavigation: readonly LessonScenarioNavigationItem[];
  section: HarnessSection;
  selectedScenario: LessonScenario;
}>) {
  const apiBaseUrl = resolveApiBaseUrl();
  const apiHealthState = useApiHealth();

  return (
    <>
      <a className={styles.skipLink} href="#main-content">
        Skip to main content
      </a>
      <SiteHeader apiHealthState={apiHealthState} />
      <PrimaryNavigation scenarioId={selectedScenario.id} section={section} />
      <main className={styles.main} id="main-content">
        {section === "lessons" ? (
          <LessonScenarioView
            apiBaseUrl={apiBaseUrl}
            scenario={selectedScenario}
            scenarioNavigation={scenarioNavigation}
          />
        ) : (
          <SmokeTestsView />
        )}
      </main>
    </>
  );
}
