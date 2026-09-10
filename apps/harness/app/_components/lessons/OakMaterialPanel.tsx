"use client";

import { useOakMaterial, type OakMaterialState } from "./useOakMaterial";
import styles from "../../page.module.css";
import type { OakMaterialPart } from "./oak-material-api";
import type { LessonScenario } from "../../scenario-types";

const actionLabels: Record<OakMaterialState, string> = {
  error: "Try again",
  idle: "Load Oak material",
  loading: "Loading…",
  ready: "Reload Oak material",
};

function PartBody({
  lessonTitle,
  part,
}: Readonly<{ lessonTitle: string; part: OakMaterialPart }>) {
  if (part.warning !== null) {
    return <p>{part.warning}</p>;
  }

  if (part.key === "lesson.transcript") {
    return (
      <details className={styles.materialTranscript}>
        <summary>Read the whole transcript</summary>
        <pre aria-label={`Lesson transcript for ${lessonTitle}`}>
          <code>{part.text}</code>
        </pre>
      </details>
    );
  }

  return (
    <pre>
      <code>{part.text}</code>
    </pre>
  );
}

export function OakMaterialPanel({ scenario }: Readonly<{ scenario: LessonScenario }>) {
  const { error, load, parts, state } = useOakMaterial(scenario.lesson);
  const present = parts.filter(({ text }) => text !== null);

  return (
    <section aria-labelledby="oak-material-heading" className={styles.oakMaterial}>
      <div className={styles.sectionHeadingRow}>
        <div>
          <p className={styles.eyebrow}>Oak lesson material</p>
          <h2 id="oak-material-heading">What Oak publishes for this lesson</h2>
        </div>
        <button
          className={styles.workerTestButton}
          disabled={state === "loading"}
          onClick={load}
          type="button"
        >
          {actionLabels[state]}
        </button>
      </div>

      <div aria-live="polite">
        {state === "loading" && (
          <p>Reading the lesson and summarising its transcript…</p>
        )}
        {state === "error" && (
          <p className={styles.errorMessage}>
            {error ?? "The material could not load."}
          </p>
        )}
        {state === "ready" && (
          <p>
            {present.length === 0
              ? "Oak publishes none of this material for this lesson."
              : `${present.length} of ${parts.length} parts have content for this lesson.`}
          </p>
        )}
      </div>
      {state === "ready" && (
        <ul className={styles.materialParts}>
          {parts.map((part) => (
            <li key={part.key}>
              <h3>{part.label}</h3>
              <PartBody lessonTitle={scenario.lesson.title} part={part} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
