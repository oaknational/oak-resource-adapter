"use client";

import { ResourceAdapterDialog } from "@oaknational/resource-adapter";
import { useAuth } from "@clerk/nextjs";
import { raLogger } from "@oaknational/resource-adapter-logger";
import { useEffect, useState } from "react";

import { CreateMorePanel } from "./CreateMorePanel";
import { LessonMetadata } from "./LessonMetadata";
import { ScenarioNavigation } from "./ScenarioNavigation";
import { WorksheetPanel } from "./WorksheetPanel";
import styles from "../page.module.css";
import { useCapabilities } from "../_hooks/useCapabilities";
import type { LessonScenario, LessonScenarioNavigationItem } from "../scenario-types";

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
  const { capabilities, reload, state } = useCapabilities({
    apiBaseUrl,
    lesson,
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    setIsDialogOpen(false);
  }, [lesson.lessonSlug]);

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

        <CreateMorePanel
          hasCapabilities={capabilities.length > 0}
          onOpen={() => setIsDialogOpen(true)}
          onRetry={reload}
          state={state}
        />
        <LessonMetadata scenario={scenario} />
        <WorksheetPanel scenario={scenario} />
      </article>
      <ResourceAdapterDialog
        apiBaseUrl={apiBaseUrl}
        capabilities={capabilities}
        getToken={getToken}
        isOpen={isDialogOpen}
        lesson={lesson}
        onClose={() => setIsDialogOpen(false)}
        onError={(error) => log.error(error)}
        resourceDocumentSummary={scenario.documentSummary}
      />
    </>
  );
}
