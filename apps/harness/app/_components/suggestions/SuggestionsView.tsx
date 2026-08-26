"use client";

import { SuggestionControls } from "./SuggestionControls";
import { SuggestionResults } from "./SuggestionResults";
import { useSuggestionWorkbench } from "./useSuggestionWorkbench";
import { ScenarioNavigation } from "../shared/ScenarioNavigation";
import styles from "../../page.module.css";
import type {
  LessonScenario,
  LessonScenarioNavigationItem,
} from "../../scenario-types";

export function SuggestionsView({
  scenario,
  scenarioNavigation,
}: Readonly<{
  scenario: LessonScenario;
  scenarioNavigation: readonly LessonScenarioNavigationItem[];
}>) {
  const workbench = useSuggestionWorkbench(scenario);

  return (
    <>
      <ScenarioNavigation
        hrefFor={(id) => `/?view=suggestions&lesson=${id}`}
        items={scenarioNavigation.map(({ id, keyStage, subject, title }) => ({
          detail: `${keyStage} · ${subject}`,
          id,
          title,
        }))}
        label="Suggestion fixtures"
        selectedId={scenario.id}
      />
      <article className={styles.suggestions}>
        <p className={styles.eyebrow}>Suggestion-agent tools</p>
        <h1>Test suggestions</h1>
        <p>
          Preview the rendered prompt and run the suggestion agent directly against the
          selected fixture. Results are temporary and are not saved.
        </p>

        {workbench.catalogueError !== null && (
          <p className={styles.errorMessage} role="alert">
            {workbench.catalogueError}
          </p>
        )}

        <SuggestionControls {...workbench} />
        <SuggestionResults {...workbench} />
      </article>
    </>
  );
}
