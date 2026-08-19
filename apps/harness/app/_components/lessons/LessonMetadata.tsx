import styles from "../../page.module.css";
import type { LessonScenario } from "../../scenario-types";

export function LessonMetadata({ scenario }: Readonly<{ scenario: LessonScenario }>) {
  return (
    <section aria-labelledby="lesson-metadata-heading">
      <h2 id="lesson-metadata-heading">Lesson metadata</h2>
      <dl className={styles.metadataGrid}>
        <div>
          <dt>Unit</dt>
          <dd>{scenario.unit.title}</dd>
        </div>
        <div>
          <dt>Programme</dt>
          <dd>{scenario.lesson.programmeSlug}</dd>
        </div>
        <div>
          <dt>Exam board</dt>
          <dd>{scenario.programme.examBoard ?? "Not applicable"}</dd>
        </div>
        <div>
          <dt>Tier</dt>
          <dd>{scenario.programme.tier ?? "Not applicable"}</dd>
        </div>
        <div>
          <dt>Content guidance</dt>
          <dd>
            {scenario.contentGuidance.length === 0
              ? "None"
              : scenario.contentGuidance.join(", ")}
          </dd>
        </div>
        <div>
          <dt>Original Oak Files</dt>
          <dd>
            {scenario.originalFileResourceTypes.map((resourceType, index) => {
              const hasExtraction =
                scenario.extractedResourceTypes.includes(resourceType);

              return (
                <span key={resourceType}>
                  {index === 0 ? "" : ", "}
                  <span className={hasExtraction ? styles.matchedResource : undefined}>
                    {resourceType}
                    {hasExtraction && (
                      <span className={styles.visuallyHidden}> (data held)</span>
                    )}
                  </span>
                </span>
              );
            })}
          </dd>
        </div>
        <div>
          <dt>Extractions held</dt>
          <dd>
            {scenario.extractedResourceTypes.length === 0
              ? "None"
              : scenario.extractedResourceTypes.join(", ")}
          </dd>
        </div>
      </dl>
      <p>
        <a href={scenario.sourceUrl}>View the lesson on Oak</a>
      </p>
    </section>
  );
}
