import styles from "../page.module.css";
import type { LessonScenario } from "../scenario-types";

const checkDateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
  year: "numeric",
});

function formatCheckDate(isoDate: string) {
  return checkDateFormat.format(new Date(`${isoDate}T00:00:00Z`));
}

export function WorksheetPanel({ scenario }: Readonly<{ scenario: LessonScenario }>) {
  const summary = scenario.documentSummary;

  return (
    <section aria-labelledby="worksheet-heading" className={styles.worksheet}>
      <div className={styles.sectionHeadingRow}>
        <div>
          <p className={styles.eyebrow}>Selected resource</p>
          <h2 id="worksheet-heading">Worksheet data</h2>
        </div>
        <span className={styles.verifiedBadge}>
          Rights checked {formatCheckDate(scenario.rightsCheckedOn)}
        </span>
      </div>
      <p>{scenario.rights} checked when the fixture corpus was snapshotted.</p>
      <dl className={styles.documentSummary}>
        <div>
          <dt>Profile</dt>
          <dd>{summary.profile}</dd>
        </div>
        <div>
          <dt>Schema</dt>
          <dd>{summary.schemaVersion}</dd>
        </div>
        <div>
          <dt>Content nodes</dt>
          <dd>{summary.contentNodeCount}</dd>
        </div>
        <div>
          <dt>Questions</dt>
          <dd>{summary.questionCount}</dd>
        </div>
        <div>
          <dt>Assets</dt>
          <dd>{summary.assetCount}</dd>
        </div>
        <div>
          <dt>Diagnostics</dt>
          <dd>{summary.diagnosticCount}</dd>
        </div>
      </dl>
      <details className={styles.markupDetails}>
        <summary>Browse extracted markup</summary>
        <pre aria-label={`Extracted markup for ${scenario.lesson.title}`} tabIndex={0}>
          <code>{scenario.markup}</code>
        </pre>
      </details>
    </section>
  );
}
