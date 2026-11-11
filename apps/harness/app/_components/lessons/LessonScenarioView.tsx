"use client";

import { OakLoadingSpinner } from "@oaknational/oak-components";

import { CreateMorePanel } from "../shared/CreateMorePanel";
import { LessonMetadata } from "./LessonMetadata";
import { OakMaterialPanel } from "./OakMaterialPanel";
import { ScenarioLayout } from "../shared/ScenarioLayout";
import { lessonNavigationItems } from "../shared/ScenarioNavigation";
import { ViewAsControl } from "../shared/ViewAs";
import { WorksheetPanel } from "./WorksheetPanel";
import styles from "./LessonScenarioView.module.css";
import shared from "../shared/shared.module.css";
import { useAdapterLauncher } from "../../_hooks/useAdapterLauncher";
import type {
  LessonScenario,
  LessonScenarioNavigationItem,
} from "../../scenario-types";

export function LessonScenarioView({
  apiBaseUrl,
  scenario,
  scenarioNavigation,
}: Readonly<{
  apiBaseUrl: string;
  scenario: LessonScenario;
  scenarioNavigation: readonly LessonScenarioNavigationItem[];
}>) {
  const lesson = scenario.lesson;
  const launcher = useAdapterLauncher({
    apiBaseUrl,
    lesson,
    resetKey: lesson.lessonSlug,
  });

  return (
    <>
      <ScenarioLayout
        hrefFor={(id) => `/?lesson=${id}`}
        items={lessonNavigationItems(scenarioNavigation)}
        label="Lesson scenarios"
        selectedId={scenario.id}
      >
        <article className={shared.lesson}>
          <header className={styles.pageHeader}>
            <p className={shared.eyebrow}>Lesson page demo</p>
            <h1 className={styles.pageTitle}>Try ORA: What teachers will see on OWA</h1>
            <ViewAsControl />
          </header>

          <div className={styles.lessonPanel}>
            <p className={styles.programme}>
              {scenario.programme.subject} · {scenario.programme.keyStage}
            </p>
            <h2 className={styles.lessonTitle}>{lesson.title}</h2>
            {launcher.state === "loading" ? (
              <div className={styles.loading}>
                <span aria-hidden="true">
                  <OakLoadingSpinner $width="spacing-24" />
                </span>
                <output>Loading…</output>
              </div>
            ) : (
              <CreateMorePanel
                account={launcher.account}
                capabilities={launcher.capabilities}
                hasAvailableCapabilities={launcher.hasAvailableCapabilities}
                lesson={lesson}
                onFinishSetup={launcher.finishSetup}
                onRetry={launcher.reload}
                onSelectCapability={launcher.selectCapability}
                onSignIn={launcher.signIn}
                state={launcher.state}
              />
            )}
          </div>
          <LessonMetadata scenario={scenario} />
          <OakMaterialPanel scenario={scenario} />
          <WorksheetPanel scenario={scenario} />
        </article>
      </ScenarioLayout>
      {launcher.dialog}
    </>
  );
}
