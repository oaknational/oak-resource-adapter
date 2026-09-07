"use client";

import { SuggestionControls } from "./SuggestionControls";
import { SuggestionResults } from "./SuggestionResults";
import { useSuggestionWorkbench } from "./useSuggestionWorkbench";
import { ResourceDocumentInspector } from "../shared/ResourceDocumentInspector";
import { ScenarioNavigation } from "../shared/ScenarioNavigation";
import styles from "../../page.module.css";
import type {
  LessonScenario,
  LessonScenarioNavigationItem,
} from "../../scenario-types";

export function SuggestionsView({
  initialFlowId,
  scenario,
  scenarioNavigation,
}: Readonly<{
  initialFlowId?: string | undefined;
  scenario: LessonScenario;
  scenarioNavigation: readonly LessonScenarioNavigationItem[];
}>) {
  const workbench = useSuggestionWorkbench(scenario, initialFlowId);

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
        <section
          aria-labelledby="suggestion-agent-context"
          className={styles.agentContext}
        >
          <h2 id="suggestion-agent-context">Worksheet context</h2>
          <p>
            This is the worksheet structure and content the agent considers before it
            chooses a transformation.
          </p>
          <ResourceDocumentInspector
            document={scenario.document}
            label="Worksheet available to the agent"
          />
        </section>
        <SuggestionResults {...workbench} document={scenario.document} />
      </article>
    </>
  );
}
