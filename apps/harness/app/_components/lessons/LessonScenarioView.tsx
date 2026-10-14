"use client";

import { CreateMorePanel } from "../shared/CreateMorePanel";
import { LessonMetadata } from "./LessonMetadata";
import { OakMaterialPanel } from "./OakMaterialPanel";
import { ScenarioLayout } from "../shared/ScenarioLayout";
import { OwaSlot, owaSlotBadge } from "../shared/OwaSlot";
import { withViewAs } from "../shared/ViewAs";
import { WorksheetPanel } from "./WorksheetPanel";
import styles from "../../page.module.css";
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
        hrefFor={(id) => withViewAs(`/?lesson=${id}`, launcher.viewAsSignedOut)}
        items={scenarioNavigation.map(({ id, keyStage, subject, title }) => ({
          id,
          title,
          detail: `${keyStage} · ${subject}`,
        }))}
        label="Lesson scenarios"
        selectedId={scenario.id}
      >
        <article className={styles.lesson}>
          <p className={styles.eyebrow}>
            {scenario.programme.keyStage} · {scenario.programme.subject}
          </p>
          <h1>{lesson.title}</h1>
          <p>{scenario.description}</p>

          <OwaSlot badge={owaSlotBadge(launcher.state, launcher.capabilities.length)}>
            <CreateMorePanel
              capabilities={launcher.capabilities}
              hasAvailableCapabilities={launcher.hasAvailableCapabilities}
              onSelectCapability={launcher.selectCapability}
              onRetry={launcher.reload}
              onPreviewSignIn={launcher.exitSignedOutPreview}
              state={launcher.state}
            />
          </OwaSlot>
          <LessonMetadata scenario={scenario} />
          <OakMaterialPanel scenario={scenario} />
          <WorksheetPanel scenario={scenario} />
        </article>
      </ScenarioLayout>
      {launcher.dialog}
    </>
  );
}
