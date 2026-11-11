"use client";

import type {
  ResourceAdapterCapabilityOption,
  ResourceAdapterOpeningControl,
} from "@oaknational/resource-adapter";

import { CreateMorePanel } from "../shared/CreateMorePanel";
import { ExtractionNotes } from "../shared/ExtractionNotes";
import { ScenarioLayout } from "../shared/ScenarioLayout";
import { OwaSlot, owaSlotBadge } from "../shared/OwaSlot";
import shared from "../shared/shared.module.css";
import { useAdapterLauncher } from "../../_hooks/useAdapterLauncher";
import type { EdgeCase, EdgeCaseNavigationItem } from "../../scenario-types";

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
  const {
    account,
    capabilities,
    dialog,
    finishSetup,
    hasAvailableCapabilities,
    reload,
    selectCapability,
    signIn,
    state,
  } = useAdapterLauncher({
    apiBaseUrl: edgeCase.brokenApiPath ? `${apiBaseUrl}-unreachable` : apiBaseUrl,
    lesson,
    resetKey: edgeCase.id,
  });

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
      <ScenarioLayout
        hrefFor={(id) => `/?view=edge-cases&case=${id}`}
        items={navigation.map(({ id, summary, title }) => ({
          id,
          title,
          detail: summary,
        }))}
        label="Edge cases"
        selectedId={edgeCase.id}
      >
        <article className={shared.lesson}>
          <p className={shared.eyebrow}>{edgeCase.expectation}</p>
          <h1>{edgeCase.title}</h1>
          <p>{edgeCase.reason}</p>

          <OwaSlot
            badge={
              showCapabilityFixture
                ? "Fixture"
                : owaSlotBadge({
                    account,
                    capabilities,
                    hasAvailableCapabilities,
                    state,
                  })
            }
          >
            {showCapabilityFixture ? (
              <CreateMorePanel
                account={account}
                capabilities={fixtureCapabilities}
                hasAvailableCapabilities={hasAvailableCapabilities}
                lesson={lesson}
                onFinishSetup={finishSetup}
                onRetry={reload}
                onSelectCapability={selectFixtureCapability}
                onSignIn={signIn}
                state={state}
              />
            ) : (
              <CreateMorePanel
                account={account}
                capabilities={capabilities}
                hasAvailableCapabilities={hasAvailableCapabilities}
                lesson={lesson}
                onFinishSetup={finishSetup}
                onRetry={reload}
                onSelectCapability={selectCapability}
                onSignIn={signIn}
                state={state}
              />
            )}
          </OwaSlot>

          <ExtractionNotes
            diagnostics={edgeCase.diagnostics}
            unsupportedNodeIds={edgeCase.unsupportedNodeIds}
          />

          <section aria-labelledby="details-heading">
            <h2 id="details-heading">Details</h2>
            <p data-testid="capability-outcome">{capabilityOutcome}</p>
            <dl className={shared.metadataGrid}>
              {edgeCase.facts.map((fact) => (
                <div key={fact.term}>
                  <dt>{fact.term}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </article>
      </ScenarioLayout>
      {dialog}
    </>
  );
}
