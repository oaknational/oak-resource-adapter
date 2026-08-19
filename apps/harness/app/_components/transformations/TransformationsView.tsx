"use client";

import { OakMaterialTable } from "./OakMaterialTable";
import { TransformationControls } from "./TransformationControls";
import { TransformationDocumentComparison } from "./TransformationDocumentComparison";
import { TransformationResults } from "./TransformationResults";
import { useTransformationWorkbench } from "./useTransformationWorkbench";
import { ScenarioNavigation } from "../shared/ScenarioNavigation";
import styles from "../../page.module.css";
import type {
  LessonScenario,
  LessonScenarioNavigationItem,
} from "../../scenario-types";

export function TransformationsView({
  scenario,
  scenarioNavigation,
}: Readonly<{
  scenario: LessonScenario;
  scenarioNavigation: readonly LessonScenarioNavigationItem[];
}>) {
  const workbench = useTransformationWorkbench(scenario);

  return (
    <>
      <ScenarioNavigation
        hrefFor={(id) => `/?view=transformations&lesson=${id}`}
        items={scenarioNavigation.map(({ id, keyStage, subject, title }) => ({
          id,
          title,
          detail: `${keyStage} · ${subject}`,
        }))}
        label="Transformation fixtures"
        selectedId={scenario.id}
      />
      <article className={styles.transformations}>
        <p className={styles.eyebrow}>Individual prompt tools</p>
        <h1>Test transformations</h1>
        <p>
          Preview prompts and run transformations directly against the selected fixture.
        </p>

        {workbench.catalogueError !== null && (
          <p className={styles.errorMessage} role="alert">
            {workbench.catalogueError}
          </p>
        )}

        <TransformationControls {...workbench} />
        <TransformationResults {...workbench} />
        <TransformationDocumentComparison {...workbench} />
        <OakMaterialTable {...workbench} />
      </article>
    </>
  );
}
