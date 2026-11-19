"use client";

import type { ResourceAdapterCapabilityOption } from "@oaknational/resource-adapter";

import { EligibilityPanel } from "./EligibilityPanel";
import { LessonAiPanel } from "../shared/LessonAiPanel";
import { ExtractionNotes } from "../shared/ExtractionNotes";
import { ScenarioLayout } from "../shared/ScenarioLayout";
import { OwaSlot, owaSlotBadge } from "./OwaSlot";
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
    available,
    capabilities,
    dialog,
    finishSetup,
    inCopyrightRegion,
    reload,
    reportError,
    selectCapability,
    signIn,
    state,
    teachingMaterials,
    trackAnalyticsEvent,
  } = useAdapterLauncher({
    apiBaseUrl: edgeCase.brokenApiPath ? `${apiBaseUrl}-unreachable` : apiBaseUrl,
    lesson,
    resetKey: edgeCase.id,
  });

  // The fixture offers a choice the service does not implement, so whichever
  // one is picked opens the worksheet workflow.
  function selectFixtureCapability(option: ResourceAdapterCapabilityOption) {
    selectCapability({
      id: "worksheetScaffolding",
      label: option.label,
      resourceType: "worksheet",
    });
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
  const panel = {
    account,
    available,
    lesson,
    onAnalyticsEvent: trackAnalyticsEvent,
    onError: reportError,
    onFinishSetup: finishSetup,
    onRetry: reload,
    onSignIn: signIn,
    state,
    teachingMaterials,
  };

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
                    available,
                    capabilities,
                    state,
                    teachingMaterials,
                  })
            }
          >
            {showCapabilityFixture ? (
              <LessonAiPanel
                {...panel}
                capabilities={fixtureCapabilities}
                onSelectCapability={selectFixtureCapability}
              />
            ) : (
              <LessonAiPanel
                {...panel}
                capabilities={capabilities}
                onSelectCapability={selectCapability}
              />
            )}
          </OwaSlot>

          {!edgeCase.brokenApiPath && (
            <EligibilityPanel
              account={account}
              capabilitiesFailed={state === "error"}
              inCopyrightRegion={inCopyrightRegion}
              lesson={lesson}
            />
          )}

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
