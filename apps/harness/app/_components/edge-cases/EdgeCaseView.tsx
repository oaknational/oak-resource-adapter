"use client";

import {
  ResourceAdapterDialog,
  type ResourceAdapterCapability,
  type ResourceAdapterCapabilityOption,
  type ResourceAdapterOpeningControl,
} from "@oaknational/resource-adapter";
import { useAuth } from "@clerk/nextjs";
import { raLogger } from "@oaknational/resource-adapter-logger";
import { useEffect, useState } from "react";

import { CreateMorePanel } from "../shared/CreateMorePanel";
import { ExtractionNotes } from "../shared/ExtractionNotes";
import { ScenarioNavigation } from "../shared/ScenarioNavigation";
import styles from "../../page.module.css";
import { useCapabilities } from "../../_hooks/useCapabilities";
import { useHarnessAnalytics } from "../../_hooks/useHarnessAnalytics";
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
  const { trackAnalyticsEvent, trackAdapterOpened } = useHarnessAnalytics();
  const { capabilities, hasAvailableCapabilities, reload, state } = useCapabilities({
    apiBaseUrl: edgeCase.brokenApiPath ? `${apiBaseUrl}-unreachable` : apiBaseUrl,
    lesson,
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCapability, setSelectedCapability] = useState<
    ResourceAdapterCapability | undefined
  >();

  useEffect(() => {
    setIsDialogOpen(false);
    setSelectedCapability(undefined);
  }, [edgeCase.id]);

  function selectCapability(
    capability: ResourceAdapterCapability,
    control: ResourceAdapterOpeningControl,
  ) {
    setSelectedCapability(capability);
    setIsDialogOpen(true);
    trackAdapterOpened(capability.id, control);
  }

  // The fixture offers a choice the service does not implement, so whichever
  // one is picked opens the worksheet workflow.
  function selectFixtureCapability(
    option: ResourceAdapterCapabilityOption,
    control: ResourceAdapterOpeningControl,
  ) {
    selectCapability(
      { id: "worksheetScaffolding", label: option.label, resourceType: "worksheet" },
      control,
    );
  }

  const fixtureCapabilities = edgeCase.uiCapabilities;
  const showCapabilityFixture = fixtureCapabilities !== undefined && state === "ready";

  function describeCapabilityOutcome() {
    if (showCapabilityFixture) {
      return `The UI fixture provides ${fixtureCapabilities.length} capability choices.`;
    }

    if (state === "ready") {
      return `The capabilities endpoint returned ${capabilities.length} capabilities.`;
    }

    return `Capabilities state: ${state}.`;
  }

  const capabilityOutcome = describeCapabilityOutcome();

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
            {showCapabilityFixture ? (
              <CreateMorePanel
                capabilities={fixtureCapabilities}
                hasAvailableCapabilities={hasAvailableCapabilities}
                onSelectCapability={selectFixtureCapability}
                onRetry={reload}
                state={state}
              />
            ) : (
              <CreateMorePanel
                capabilities={capabilities}
                hasAvailableCapabilities={hasAvailableCapabilities}
                onSelectCapability={selectCapability}
                onRetry={reload}
                state={state}
              />
            )}
          </div>
        </section>

        <ExtractionNotes
          diagnostics={edgeCase.diagnostics}
          unsupportedNodeIds={edgeCase.unsupportedNodeIds}
        />

        <section aria-labelledby="details-heading">
          <h2 id="details-heading">Details</h2>
          <p data-testid="capability-outcome">{capabilityOutcome}</p>
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
      {selectedCapability && (
        <ResourceAdapterDialog
          apiBaseUrl={apiBaseUrl}
          capability={selectedCapability}
          getToken={getToken}
          isOpen={isDialogOpen}
          lesson={lesson}
          onAnalyticsEvent={trackAnalyticsEvent}
          onClose={() => setIsDialogOpen(false)}
          onError={(error) => log.error(error)}
        />
      )}
    </>
  );
}
