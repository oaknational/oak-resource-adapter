"use client";

import {
  ResourceAdapterDialog,
  type ResourceAdapterCapability,
} from "@oaknational/resource-adapter";
import { useAuth } from "@clerk/nextjs";
import { raLogger } from "@oaknational/resource-adapter-logger";
import { useEffect, useState } from "react";

import { CreateMorePanel } from "../shared/CreateMorePanel";
import { LessonMetadata } from "./LessonMetadata";
import { OakMaterialPanel } from "./OakMaterialPanel";
import { ScenarioNavigation } from "../shared/ScenarioNavigation";
import { WorksheetPanel } from "./WorksheetPanel";
import styles from "../../page.module.css";
import { useCapabilities } from "../../_hooks/useCapabilities";
import type {
  LessonScenario,
  LessonScenarioNavigationItem,
} from "../../scenario-types";

const log = raLogger("harness");

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
  const { getToken } = useAuth();
  const { capabilities, hasAvailableCapabilities, reload, state } = useCapabilities({
    apiBaseUrl,
    lesson,
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCapability, setSelectedCapability] = useState<
    ResourceAdapterCapability | undefined
  >();

  useEffect(() => {
    setIsDialogOpen(false);
    setSelectedCapability(undefined);
  }, [lesson.lessonSlug]);

  function selectCapability(capability: ResourceAdapterCapability) {
    setSelectedCapability(capability);
    setIsDialogOpen(true);
  }

  return (
    <>
      <ScenarioNavigation
        hrefFor={(id) => `/?lesson=${id}`}
        items={scenarioNavigation.map(({ id, keyStage, subject, title }) => ({
          id,
          title,
          detail: `${keyStage} · ${subject}`,
        }))}
        label="Lesson scenarios"
        selectedId={scenario.id}
      />
      <article className={styles.lesson}>
        <p className={styles.eyebrow}>
          {scenario.programme.keyStage} · {scenario.programme.subject}
        </p>
        <h1>{lesson.title}</h1>
        <p>{scenario.description}</p>

        {/* Only the launcher gets the framing; the other states bring their own. */}
        <div
          className={capabilities.length > 0 ? styles.lessonAdapterAction : undefined}
        >
          <CreateMorePanel
            capabilities={capabilities}
            hasAvailableCapabilities={hasAvailableCapabilities}
            onSelectCapability={selectCapability}
            onRetry={reload}
            state={state}
          />
        </div>
        <LessonMetadata scenario={scenario} />
        <OakMaterialPanel scenario={scenario} />
        <WorksheetPanel scenario={scenario} />
      </article>
      {selectedCapability && (
        <ResourceAdapterDialog
          apiBaseUrl={apiBaseUrl}
          capability={selectedCapability}
          getToken={getToken}
          isOpen={isDialogOpen}
          lesson={lesson}
          onClose={() => setIsDialogOpen(false)}
          onError={(error) => log.error(error)}
        />
      )}
    </>
  );
}
