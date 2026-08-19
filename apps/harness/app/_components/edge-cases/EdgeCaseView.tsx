"use client";

import { ResourceAdapterDialog } from "@oaknational/resource-adapter";
import { useAuth } from "@clerk/nextjs";
import { raLogger } from "@oaknational/resource-adapter-logger";
import { useEffect, useState } from "react";

import { CreateMorePanel } from "../shared/CreateMorePanel";
import { ExtractionNotes } from "../shared/ExtractionNotes";
import { ScenarioNavigation } from "../shared/ScenarioNavigation";
import styles from "../../page.module.css";
import { useCapabilities } from "../../_hooks/useCapabilities";
import type { EdgeCase, EdgeCaseNavigationItem } from "../../scenario-types";

const log = raLogger("harness");

export function EdgeCaseView({
  apiBaseUrl,
  edgeCase,
  navigation,
}: Readonly<{
  apiBaseUrl: string;
  edgeCase: EdgeCase;
  navigation: readonly EdgeCaseNavigationItem[];
}>) {
  const lesson = edgeCase.lesson;
  const { getToken } = useAuth();
  const { capabilities, reload, state } = useCapabilities({
    apiBaseUrl: edgeCase.brokenApiPath ? `${apiBaseUrl}-unreachable` : apiBaseUrl,
    lesson,
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    setIsDialogOpen(false);
  }, [edgeCase.id]);

  return (
    <>
      <ScenarioNavigation
        hrefFor={(id) => `/?view=edge-cases&case=${id}`}
        items={navigation.map(({ id, summary, title }) => ({
          id,
          title,
          detail: summary,
        }))}
        label="Edge cases"
        selectedId={edgeCase.id}
      />
      <article className={styles.lesson}>
        <p className={styles.eyebrow}>{edgeCase.expectation}</p>
        <h1>{edgeCase.title}</h1>
        <p>{edgeCase.reason}</p>

        <section aria-labelledby="teachers-see-heading" className={styles.owaSlot}>
          <h2 id="teachers-see-heading">What teachers see</h2>
          <div className={styles.owaSlotContent}>
            <CreateMorePanel
              hasCapabilities={capabilities.length > 0}
              onOpen={() => setIsDialogOpen(true)}
              onRetry={reload}
              state={state}
            />
          </div>
        </section>

        <ExtractionNotes
          diagnostics={edgeCase.diagnostics}
          unsupportedNodeIds={edgeCase.unsupportedNodeIds}
        />

        <section aria-labelledby="details-heading">
          <h2 id="details-heading">Details</h2>
          <p data-testid="capability-outcome">
            {state === "ready"
              ? `The capabilities endpoint returned ${capabilities.length} capabilities.`
              : `Capabilities state: ${state}.`}
          </p>
          <dl className={styles.metadataGrid}>
            {edgeCase.facts.map((fact) => (
              <div key={fact.term}>
                <dt>{fact.term}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </article>
      <ResourceAdapterDialog
        apiBaseUrl={apiBaseUrl}
        capabilities={capabilities}
        getToken={getToken}
        isOpen={isDialogOpen}
        lesson={lesson}
        onClose={() => setIsDialogOpen(false)}
        onError={(error) => log.error(error)}
      />
    </>
  );
}
