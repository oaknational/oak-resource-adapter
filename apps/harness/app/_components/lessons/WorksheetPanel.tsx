import { ResourceDocumentRenderer } from "@oaknational/resource-adapter";

import { ExtractionNotes } from "../shared/ExtractionNotes";
import shared from "../shared/shared.module.css";
import styles from "./WorksheetPanel.module.css";
import type { LessonScenario } from "../../scenario-types";

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
      <div className={shared.sectionHeadingRow}>
        <div>
          <p className={shared.eyebrow}>Selected resource</p>
          <h2 id="worksheet-heading">Worksheet data</h2>
        </div>
        <span className={styles.verifiedBadge}>
          Rights checked {formatCheckDate(scenario.rightsCheckedOn)}
        </span>
      </div>
      <p>{scenario.rights}</p>
      <dl className={shared.documentSummary}>
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
      <ExtractionNotes
        diagnostics={scenario.diagnostics}
        unsupportedNodeIds={scenario.unsupportedNodeIds}
      />
      {/* Remount per lesson: the renderer's collapsed-task state is its own. */}
      <ResourceDocumentRenderer
        key={scenario.id}
        document={scenario.document}
        label={`Original worksheet: ${summary.title}`}
      />
      <details className={shared.markupDetails}>
        <summary>Browse extracted markup</summary>
        <pre aria-label={`Extracted markup for ${scenario.lesson.title}`}>
          <code>{scenario.markup}</code>
        </pre>
      </details>
    </section>
  );
}
