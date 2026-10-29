"use client";

import { useEffect, useRef } from "react";

import { CapabilitiesView } from "./capabilities";
import { EdgeCaseView } from "./edge-cases";
import { ExportsView } from "./exports/ExportsView";
import { LessonScenarioView } from "./lessons";
import { PrimaryNavigation, SiteHeader } from "./shared";
import { SmokeTestsView } from "./smoke-tests";
import { SuggestionsView } from "./suggestions";
import { TransformationsView } from "./transformations";
import { resolveApiBaseUrl } from "../harness-api";
import shared from "./shared/shared.module.css";
import styles from "./HarnessPageClient.module.css";
import type { HarnessView } from "../scenario-types";

export function HarnessPageClient({
  lessonId,
  view,
}: Readonly<{ lessonId: string; view: HarnessView }>) {
  const apiBaseUrl = resolveApiBaseUrl();
  const chrome = useRef<HTMLDivElement>(null);

  // The sticky sidebar sits under the sticky header, whose height wraps with its content.
  useEffect(() => {
    const element = chrome.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(() => {
      document.documentElement.style.setProperty(
        "--harness-chrome-height",
        `${element.offsetHeight}px`,
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const hasScenarioSidebar = "navigation" in view;

  return (
    <>
      <a className={styles.skipLink} href="#main-content">
        Skip to main content
      </a>
      <div className={styles.chrome} ref={chrome}>
        <SiteHeader />
        <PrimaryNavigation lessonId={lessonId} section={view.section} />
      </div>
      <main
        className={
          hasScenarioSidebar ? `${shared.main} ${styles.mainWithSidebar}` : shared.main
        }
        id="main-content"
      >
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
        {view.section === "exports" && (
          <ExportsView
            key={`${view.mode}:${view.fixtureId}`}
            {...view}
            lessonId={lessonId}
          />
        )}
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
