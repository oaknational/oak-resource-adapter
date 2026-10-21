"use client";

import { OakMaterialTable } from "./OakMaterialTable";
import { TransformationControls } from "./TransformationControls";
import { TransformationDocumentComparison } from "./TransformationDocumentComparison";
import { TransformationResults } from "./TransformationResults";
import { useTransformationWorkbench } from "./useTransformationWorkbench";
import { ScenarioLayout } from "../shared/ScenarioLayout";
import shared from "../shared/shared.module.css";
import type {
  LessonScenario,
  LessonScenarioNavigationItem,
} from "../../scenario-types";

export function TransformationsView({
  initialKind,
  scenario,
  scenarioNavigation,
}: Readonly<{
  initialKind?: string | undefined;
  scenario: LessonScenario;
  scenarioNavigation: readonly LessonScenarioNavigationItem[];
}>) {
  const workbench = useTransformationWorkbench(scenario, initialKind);

  return (
    <ScenarioLayout
      hrefFor={(id) => `/?view=transformations&lesson=${id}`}
      items={scenarioNavigation.map(({ id, keyStage, subject, title }) => ({
        id,
        title,
        detail: `${keyStage} · ${subject}`,
      }))}
      label="Transformation fixtures"
      selectedId={scenario.id}
    >
      <article className={shared.transformations}>
        <p className={shared.eyebrow}>Individual prompt tools</p>
        <h1>Test transformations</h1>
        <p>
          Preview prompts and run transformations directly against the selected fixture.
        </p>

        {workbench.catalogueError !== null && (
          <p className={shared.errorMessage} role="alert">
            {workbench.catalogueError}
          </p>
        )}

        <TransformationControls {...workbench} />
        <TransformationResults {...workbench} />
        <TransformationDocumentComparison {...workbench} />
        <OakMaterialTable {...workbench} />
      </article>
    </ScenarioLayout>
  );
}
